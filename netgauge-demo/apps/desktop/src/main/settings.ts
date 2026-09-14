import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DEFAULT_SETTINGS, sanitizeSettings, type NetGaugeSettings } from '../shared/bridge';

export function settingsPath(userDataDir: string): string {
  return join(userDataDir, 'netgauge-settings.json');
}

export interface LoadResult {
  settings: NetGaugeSettings;
  /** Present when the file was missing, unreadable or corrupt. */
  error?: string;
}

/** Reads settings from disk, falling back to defaults for anything unusable. */
export function loadSettings(file: string): LoadResult {
  try {
    if (!existsSync(file)) return { settings: DEFAULT_SETTINGS };
    const raw = readFileSync(file, 'utf8');
    if (!raw.trim()) return { settings: DEFAULT_SETTINGS };
    return { settings: sanitizeSettings(JSON.parse(raw)) };
  } catch (error) {
    return { settings: DEFAULT_SETTINGS, error: error instanceof Error ? error.message : String(error) };
  }
}

export function saveSettings(file: string, settings: NetGaugeSettings): void {
  const dir = dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  // Write-then-rename would be safer against power loss; a plain write is fine here
  // because the file is tiny and always re-sanitised on load.
  writeFileSync(file, JSON.stringify(settings, null, 2), 'utf8');
}

/** Small observable store used by the main process. */
export class SettingsStore {
  private current: NetGaugeSettings;
  private readonly listeners = new Set<(settings: NetGaugeSettings) => void>();

  constructor(
    private readonly file: string,
    initial?: LoadResult,
  ) {
    this.current = initial?.settings ?? loadSettings(file).settings;
  }

  get(): NetGaugeSettings {
    return this.current;
  }

  get loadError(): string | undefined {
    return undefined;
  }

  onChange(listener: (settings: NetGaugeSettings) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  update(next: NetGaugeSettings): NetGaugeSettings {
    this.current = sanitizeSettings(next);
    try {
      saveSettings(this.file, this.current);
    } catch {
      // A read-only profile should not stop the app from working for this session.
    }
    for (const listener of this.listeners) listener(this.current);
    return this.current;
  }
}
