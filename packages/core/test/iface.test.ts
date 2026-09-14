import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import {
  diffCounters,
  isPhysicalInterface,
  parseNetstatIb,
  parseNetstatSummary,
  parsePowerShellCsv,
  parseProcNetDev,
  selectInterfaces,
} from '@netgauge/core';

const PROC_SAMPLE = `Inter-|   Receive                                                |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed
    lo:    2376      18    0    0    0     0          0         0     2376      18    0    0    0     0       0          0
  eth0: 31589682    3032    0    0    0     0          0         0   191754    2438    0     0    0     0       0          0
 docker0:       0       0    0    0    0     0          0         0        0       0    0     0    0     0       0          0
`;

const PS_CSV = `"Name","ReceivedBytes","SentBytes"
"Ethernet 2","1000","500"
"Wi-Fi","2048","1024"
"Loopback Pseudo-Interface 1","77","88"
`;

const NETSTAT_IB = `Name  Mtu   Network       Address            Ipkts Ierrs     Ibytes    Opkts Oerrs     Obytes  Coll
en0   1500  <Link#4>      aa:bb:cc:dd:ee:ff 10000     0    5000000     8000     0    1000000     0
en0   1500  fe80::4       fe80::1           10000     0    5000000     8000     0    1000000     0
lo0   16384 <Link#1>                           500     0      50000      500     0      50000     0
`;

describe('interface counter parsers', () => {
  it('parses /proc/net/dev', () => {
    const list = parseProcNetDev(PROC_SAMPLE);
    expect(list).toHaveLength(3);
    expect(list[1]).toEqual({ name: 'eth0', rxBytes: 31_589_682, txBytes: 191_754 });
  });

  it('reads the live /proc/net/dev on Linux runners', (ctx) => {
    if (!existsSync('/proc/net/dev')) return ctx.skip();
    const list = parseProcNetDev(readFileSync('/proc/net/dev', 'utf8'));
    expect(list.length).toBeGreaterThan(0);
    for (const iface of list) {
      expect(iface.rxBytes).toBeGreaterThanOrEqual(0);
      expect(iface.txBytes).toBeGreaterThanOrEqual(0);
    }
  });

  it('parses PowerShell ConvertTo-Csv output', () => {
    const list = parsePowerShellCsv(PS_CSV, { name: 'Name', rx: 'ReceivedBytes', tx: 'SentBytes' });
    expect(list).toEqual([
      { name: 'Ethernet 2', rxBytes: 1000, txBytes: 500 },
      { name: 'Wi-Fi', rxBytes: 2048, txBytes: 1024 },
      { name: 'Loopback Pseudo-Interface 1', rxBytes: 77, txBytes: 88 },
    ]);
  });

  it('is case-insensitive about PowerShell column names', () => {
    const list = parsePowerShellCsv(PS_CSV, { name: 'name', rx: 'receivedbytes', tx: 'sentbytes' });
    expect(list).toHaveLength(3);
  });

  it('returns nothing instead of garbage when columns are missing', () => {
    expect(parsePowerShellCsv(PS_CSV, { name: 'Name', rx: 'Nope', tx: 'SentBytes' })).toEqual([]);
    expect(parsePowerShellCsv('', { name: 'Name', rx: 'a', tx: 'b' })).toEqual([]);
  });

  it('parses macOS netstat -ib, de-duplicating address families', () => {
    const list = parseNetstatIb(NETSTAT_IB);
    expect(list).toHaveLength(2);
    expect(list[0]).toEqual({ name: 'en0', rxBytes: 5_000_000, txBytes: 1_000_000 });
  });

  it('parses the netstat -e summary used as a Windows fallback', () => {
    const parsed = parseNetstatSummary(
      `Interface Statistics\n\n                           Received            Sent\n\nBytes                    123456789            98765432\n`,
    );
    expect(parsed).toEqual({ rxBytes: 123_456_789, txBytes: 98_765_432 });
    expect(parseNetstatSummary('nothing useful here')).toBeNull();
  });

  it('filters out loopback and virtual adapters by default', () => {
    expect(isPhysicalInterface('eth0')).toBe(true);
    expect(isPhysicalInterface('Wi-Fi')).toBe(true);
    expect(isPhysicalInterface('lo')).toBe(false);
    expect(isPhysicalInterface('docker0')).toBe(false);
    expect(isPhysicalInterface('Local Area Connection* 12')).toBe(false);

    const list = parseProcNetDev(PROC_SAMPLE);
    expect(selectInterfaces(list).map((i) => i.name)).toEqual(['eth0']);
    expect(selectInterfaces(list, { includeVirtual: true })).toHaveLength(3);
    expect(selectInterfaces(list, { only: 'DOCKER0' }).map((i) => i.name)).toEqual(['docker0']);
  });
});

describe('diffCounters', () => {
  const at = (rx: number, tx: number) => [{ name: 'eth0', rxBytes: rx, txBytes: tx }];

  it('converts byte deltas into bits per second', () => {
    const t = diffCounters(at(0, 0), at(125_000, 25_000), 1);
    expect(t.downBps).toBe(1_000_000);
    expect(t.upBps).toBe(200_000);
    expect(t.totalBps).toBe(1_200_000);
    expect(t.interfaces).toEqual(['eth0']);
  });

  it('sums across interfaces and reports which ones were busy', () => {
    const prev = [
      { name: 'eth0', rxBytes: 0, txBytes: 0 },
      { name: 'wlan0', rxBytes: 100, txBytes: 100 },
    ];
    const next = [
      { name: 'eth0', rxBytes: 12_500, txBytes: 0 },
      { name: 'wlan0', rxBytes: 100, txBytes: 100 },
    ];
    const t = diffCounters(prev, next, 0.1);
    expect(t.downBps).toBe(1_000_000);
    expect(t.interfaces).toEqual(['eth0']);
  });

  it('drops counter resets instead of reporting a negative spike', () => {
    const t = diffCounters(at(5_000_000, 5_000_000), at(1000, 1000), 1);
    expect(t).toMatchObject({ downBps: 0, upBps: 0, rxBytes: 0, txBytes: 0 });
  });

  it('is safe for a zero or negative interval', () => {
    expect(diffCounters(at(0, 0), at(1000, 1000), 0).downBps).toBe(0);
    expect(diffCounters(at(0, 0), at(1000, 1000), -1).upBps).toBe(0);
  });
});
