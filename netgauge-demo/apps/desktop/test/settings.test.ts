import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  hexToRgb,
  mergeSettings,
  sanitizeSettings,
} from '../src/shared/bridge';
import { SettingsStore, loadSettings, saveSettings, settingsPath } from '../src/main/settings';

const dir = mkdtempSync(join(tmpdir(), 'netgauge-settings-'));
const file = join(dir, 'settings.json');

describe('settings persistence', () => {
  it('falls back to defaults when no file exists', () => {
    const result = loadSettings(join(dir, 'missing.json'));
    expect(result.settings).toEqual(DEFAULT_SETTINGS);
    expect(result.error).toBeUndefined();
  });

  it('round-trips through disk', () => {
    saveSettings(file, { ...DEFAULT_SETTINGS, appearance: { ...DEFAULT_SETTINGS.appearance, accent: '#ff00aa' } });
    const loaded = loadSettings(file);
    expect(loaded.settings.appearance.accent).toBe('#ff00aa');
    expect(JSON.parse(readFileSync(file, 'utf8')).appearance.accent).toBe('#ff00aa');
  });

  it('recovers from a corrupt file instead of crashing', () => {
    const broken = join(dir, 'broken.json');
    writeFileSync(broken, '{ this is not json', 'utf8');
    const result = loadSettings(broken);
    expect(result.settings).toEqual(DEFAULT_SETTINGS);
    expect(result.error).toBeTruthy();
  });

  it('keeps an empty file safe', () => {
    const empty = join(dir, 'empty.json');
    writeFileSync(empty, '', 'utf8');
    expect(loadSettings(empty).settings).toEqual(DEFAULT_SETTINGS);
  });

  it('names the settings file inside the user data directory', () => {
    expect(settingsPath('/tmp/profile')).toBe(join('/tmp/profile', 'netgauge-settings.json'));
  });

  it('notifies listeners and persists on update', () => {
    const store = new SettingsStore(file);
    const seen: string[] = [];
    store.onChange((s) => seen.push(s.appearance.accent));
    store.update(mergeSettings(store.get(), { appearance: { accent: '#a3e635' } }));
    expect(seen).toEqual(['#a3e635']);
    expect(loadSettings(file).settings.appearance.accent).toBe('#a3e635');
    expect(store.get().appearance.accent).toBe('#a3e635');
  });
});

describe('sanitizeSettings', () => {
  it('returns the defaults for junk input', () => {
    for (const junk of [null, undefined, 42, 'nope', [], NaN]) {
      expect(sanitizeSettings(junk)).toEqual(DEFAULT_SETTINGS);
    }
  });

  it('clamps numeric values into range', () => {
    const s = sanitizeSettings({
      appearance: { opacity: 5, blur: -20, cornerRadius: 999, fontScale: 0.1, fontWeight: 900, letterSpacing: 2 },
      widget: { width: 5000, scale: 99 },
      monitor: { sampleMs: 1, referenceMbps: -5, smoothing: 3 },
      behaviour: { warnBelowMbps: 100000 },
    });
    expect(s.appearance.opacity).toBe(1);
    expect(s.appearance.blur).toBe(0);
    expect(s.appearance.cornerRadius).toBe(32);
    expect(s.appearance.fontScale).toBe(0.8);
    expect(s.appearance.fontWeight).toBe(700);
    expect(s.appearance.letterSpacing).toBe(0.12);
    expect(s.widget.width).toBe(560);
    expect(s.widget.scale).toBe(1.8);
    expect(s.monitor.sampleMs).toBe(250);
    expect(s.monitor.referenceMbps).toBe(10);
    expect(s.monitor.smoothing).toBe(1);
    expect(s.behaviour.warnBelowMbps).toBe(1000);
  });

  it('rejects unknown enums and keeps the previous value', () => {
    const s = sanitizeSettings({ appearance: { glass: 'frosted-glass', theme: 'neon' }, monitor: { unit: 'kilobits' } });
    expect(s.appearance.glass).toBe(DEFAULT_SETTINGS.appearance.glass);
    expect(s.appearance.theme).toBe('dark');
    expect(s.monitor.unit).toBe('bits');
  });

  it('validates colours and expands shorthand hex', () => {
    expect(sanitizeSettings({ appearance: { accent: '#abc' } }).appearance.accent).toBe('#aabbcc');
    expect(sanitizeSettings({ appearance: { accent: 'not-a-colour' } }).appearance.accent).toBe(DEFAULT_SETTINGS.appearance.accent);
    expect(sanitizeSettings({ appearance: { accent: '22D3EE' } }).appearance.accent).toBe('#22d3ee');
  });

  it('only accepts bundled font families', () => {
    const s = sanitizeSettings({
      appearance: { uiFont: "'Comic Sans MS'", displayFont: "'Sora Variable'", monoFont: 'jetbrains-mono' },
    });
    expect(s.appearance.uiFont).toBe(DEFAULT_SETTINGS.appearance.uiFont);
    expect(s.appearance.displayFont).toBe("'Sora Variable'");
    // Accepts the font id as well as the CSS family.
    expect(s.appearance.monoFont).toBe("'JetBrains Mono Variable'");
  });

  it('accepts a font id for the ui slot', () => {
    expect(sanitizeSettings({ appearance: { uiFont: 'manrope' } }).appearance.uiFont).toBe("'Manrope Variable'");
  });

  it('coerces numeric strings and drops NaN', () => {
    const s = sanitizeSettings({ monitor: { sampleMs: '1500' }, speedTest: { concurrency: '4' } });
    expect(s.monitor.sampleMs).toBe(1500);
    expect(s.speedTest.concurrency).toBe(4);
    expect(sanitizeSettings({ monitor: { sampleMs: Number.NaN } }).monitor.sampleMs).toBe(DEFAULT_SETTINGS.monitor.sampleMs);
  });

  it('rounds stream counts and phase durations to integers', () => {
    const s = sanitizeSettings({ speedTest: { concurrency: 5.7, phaseDurationMs: 8123.4 } });
    expect(s.speedTest.concurrency).toBe(6);
    expect(s.speedTest.phaseDurationMs).toBe(8123);
  });

  it('normalises the widget position', () => {
    expect(sanitizeSettings({ widget: { position: { x: 10, y: 20 } } }).widget.position).toEqual({ x: 10, y: 20 });
    expect(sanitizeSettings({ widget: { position: null } }).widget.position).toBeNull();
    expect(sanitizeSettings({ widget: { position: 'nonsense' } }).widget.position).toBeNull();
  });

  it('strips trailing slashes from the speed test server URL', () => {
    expect(sanitizeSettings({ speedTest: { serverUrl: 'https://example.com///' } }).speedTest.serverUrl).toBe('https://example.com');
  });

  it('always reports version 1', () => {
    expect(sanitizeSettings({ version: 99 }).version).toBe(1);
  });
});

describe('mergeSettings', () => {
  it('patches one group without touching the others', () => {
    const merged = mergeSettings(DEFAULT_SETTINGS, { widget: { width: 420 } });
    expect(merged.widget.width).toBe(420);
    expect(merged.widget.alwaysOnTop).toBe(DEFAULT_SETTINGS.widget.alwaysOnTop);
    expect(merged.appearance).toEqual(DEFAULT_SETTINGS.appearance);
    expect(merged.monitor.sampleMs).toBe(DEFAULT_SETTINGS.monitor.sampleMs);
  });

  it('ignores an empty patch', () => {
    expect(mergeSettings(DEFAULT_SETTINGS, undefined)).toEqual(DEFAULT_SETTINGS);
  });
});

describe('hexToRgb', () => {
  it('parses full and shorthand hex', () => {
    expect(hexToRgb('#22d3ee')).toEqual([34, 211, 238]);
    expect(hexToRgb('#fff')).toEqual([255, 255, 255]);
    expect(hexToRgb('garbage')).toEqual([34, 211, 238]);
  });
});
