/**
 * Parsers for the per-interface byte counters each OS exposes, plus the throughput
 * maths that turns two counter snapshots into a live rate.
 *
 * The desktop app feeds raw OS output into these pure functions, which keeps the
 * platform glue thin and everything interesting unit-testable.
 */

export interface IfaceCounters {
  name: string;
  rxBytes: number;
  txBytes: number;
}

export interface Throughput {
  downBps: number;
  upBps: number;
  totalBps: number;
  rxBytes: number;
  txBytes: number;
  interfaces: string[];
}

/** Linux: `/proc/net/dev`. */
export function parseProcNetDev(text: string): IfaceCounters[] {
  const out: IfaceCounters[] = [];
  for (const line of text.split('\n')) {
    const idx = line.indexOf(':');
    if (idx < 0) continue; // header lines
    const name = line.slice(0, idx).trim();
    if (!name) continue;
    const fields = line.slice(idx + 1).trim().split(/\s+/).map(Number);
    if (fields.length < 9) continue;
    const rxBytes = fields[0] ?? 0;
    const txBytes = fields[8] ?? 0;
    if (!Number.isFinite(rxBytes) || !Number.isFinite(txBytes)) continue;
    out.push({ name, rxBytes, txBytes });
  }
  return out;
}

/**
 * Windows: `Get-NetAdapterStatistics | Select-Object ... | ConvertTo-Csv -NoTypeInformation`.
 * Column names vary by PowerShell culture/version, so callers pass the header mapping.
 */
export function parsePowerShellCsv(
  csv: string,
  columns: { name: string; rx: string; tx: string },
): IfaceCounters[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0] ?? '');
  const indexOf = (wanted: string) =>
    header.findIndex((h) => h.replace(/"/g, '').trim().toLowerCase() === wanted.toLowerCase());
  const nameIdx = indexOf(columns.name);
  const rxIdx = indexOf(columns.rx);
  const txIdx = indexOf(columns.tx);
  if (nameIdx < 0 || rxIdx < 0 || txIdx < 0) return [];

  const out: IfaceCounters[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = splitCsvLine(lines[i] ?? '');
    const name = (cells[nameIdx] ?? '').replace(/"/g, '').trim();
    if (!name) continue;
    const rxBytes = toNumber(cells[rxIdx]);
    const txBytes = toNumber(cells[txIdx]);
    out.push({ name, rxBytes, txBytes });
  }
  return out;
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (ch === ',' && !quoted) {
      cells.push(current);
      current = '';
      continue;
    }
    current += ch ?? '';
  }
  cells.push(current);
  return cells;
}

function toNumber(raw: string | undefined): number {
  if (!raw) return 0;
  const n = Number(raw.replace(/"/g, '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** macOS/BSD: `netstat -ib` (Name … Ibytes … Obytes). */
export function parseNetstatIb(text: string): IfaceCounters[] {
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const header = (lines[0] ?? '').trim().split(/\s+/);
  const nameIdx = header.indexOf('Name');
  const inIdx = header.indexOf('Ibytes');
  const outIdx = header.indexOf('Obytes');
  if (nameIdx < 0 || inIdx < 0 || outIdx < 0) return [];

  // `netstat -ib` repeats a row per address family; keep the widest counters per name.
  const best = new Map<string, IfaceCounters>();
  for (let i = 1; i < lines.length; i += 1) {
    const cells = (lines[i] ?? '').trim().split(/\s+/);
    const name = cells[nameIdx];
    if (!name) continue;
    const rxBytes = toNumber(cells[inIdx]);
    const txBytes = toNumber(cells[outIdx]);
    const existing = best.get(name);
    if (!existing || rxBytes + txBytes > existing.rxBytes + existing.txBytes) {
      best.set(name, { name, rxBytes, txBytes });
    }
  }
  return [...best.values()];
}

/**
 * Windows fallback when PowerShell is unavailable: the `Bytes` row of `netstat -e`,
 * which reports aggregate Received / Sent counters.
 */
export function parseNetstatSummary(text: string): { rxBytes: number; txBytes: number } | null {
  for (const line of text.split(/\r?\n/)) {
    if (!/^\s*Bytes\b/i.test(line)) continue;
    const numbers = line.match(/\d+/g);
    if (numbers && numbers.length >= 2) {
      return { rxBytes: Number(numbers[0]), txBytes: Number(numbers[1]) };
    }
  }
  return null;
}

const VIRTUAL_PATTERNS = [
  /^lo$/,
  /^loopback/i,
  /^veth/,
  /^docker/,
  /^br-/,
  /^virbr/,
  /^vboxnet/,
  /^vmnet/,
  /^tun\d/,
  /^tap\d/,
  /Local Area Connection\* \d+/,
  /^Bluetooth/i,
  /^WAN Miniport/i,
];

export function isPhysicalInterface(name: string): boolean {
  return !VIRTUAL_PATTERNS.some((re) => re.test(name.trim()));
}

export interface FilterOptions {
  /** Restrict to one adapter name (case-insensitive). */
  only?: string;
  /** Include loopback / virtual adapters. Defaults to false. */
  includeVirtual?: boolean;
}

export function selectInterfaces(list: IfaceCounters[], options: FilterOptions = {}): IfaceCounters[] {
  if (options.only) {
    const wanted = options.only.trim().toLowerCase();
    return list.filter((i) => i.name.toLowerCase() === wanted);
  }
  return list.filter((i) => options.includeVirtual || isPhysicalInterface(i.name));
}

/**
 * Diff two snapshots into bits/second. Counter resets (adapter disable/enable,
 * sleep/wake) show up as a decrease and are dropped instead of producing a spike.
 */
export function diffCounters(
  prev: IfaceCounters[],
  next: IfaceCounters[],
  seconds: number,
  options: FilterOptions = {},
): Throughput {
  if (seconds <= 0) {
    return { downBps: 0, upBps: 0, totalBps: 0, rxBytes: 0, txBytes: 0, interfaces: [] };
  }
  const before = new Map(selectInterfaces(prev, options).map((i) => [i.name, i]));
  const after = selectInterfaces(next, options);

  let rxBytes = 0;
  let txBytes = 0;
  const interfaces: string[] = [];
  for (const iface of after) {
    const was = before.get(iface.name);
    if (!was) continue;
    const dRx = iface.rxBytes - was.rxBytes;
    const dTx = iface.txBytes - was.txBytes;
    if (dRx < 0 || dTx < 0) continue; // counter reset
    rxBytes += dRx;
    txBytes += dTx;
    if (dRx + dTx > 0) interfaces.push(iface.name);
  }
  const downBps = (rxBytes / seconds) * 8;
  const upBps = (txBytes / seconds) * 8;
  return { downBps, upBps, totalBps: downBps + upBps, rxBytes, txBytes, interfaces };
}
