export interface TestRecord {
  id: string;
  at: number;
  downBps: number;
  upBps: number;
  latencyMs: number;
  jitterMs: number;
  isp?: string;
  location?: string;
}

const KEY = 'netgauge.history.v1';
const LIMIT = 12;

export function loadHistory(): TestRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TestRecord[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((r) => r && typeof r.downBps === 'number').slice(0, LIMIT);
  } catch {
    return [];
  }
}

export function pushHistory(record: TestRecord): TestRecord[] {
  const next = [record, ...loadHistory()].slice(0, LIMIT);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private mode / quota — history is a nicety, not a requirement.
  }
  return next;
}

export function clearHistory(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function relativeTime(at: number): string {
  const diff = Date.now() - at;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
