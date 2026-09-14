import type { NetGaugeSettings } from '../../shared/bridge';

function resolvedTheme(settings: NetGaugeSettings): 'dark' | 'light' {
  if (settings.appearance.theme !== 'system') return settings.appearance.theme;
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/**
 * Pushes the settings into CSS custom properties. The renderer never re-renders
 * to change the look — the browser does the work, which keeps typing in the
 * font picker at 60 fps.
 */
export function applySettings(settings: NetGaugeSettings, root: HTMLElement = document.documentElement): void {
  const a = settings.appearance;
  const style = root.style;
  style.setProperty('--ng-accent', a.accent);
  style.setProperty('--ng-opacity', String(a.opacity));
  style.setProperty('--ng-blur', `${a.blur}px`);
  style.setProperty('--ng-radius', `${a.cornerRadius}px`);
  style.setProperty('--ng-font-ui', a.uiFont);
  style.setProperty('--ng-font-display', a.displayFont);
  style.setProperty('--ng-font-mono', a.monoFont);
  style.setProperty('--ng-font-scale', String(a.fontScale));
  style.setProperty('--ng-font-weight', String(a.fontWeight));
  style.setProperty('--ng-tracking', `${a.letterSpacing}em`);
  style.setProperty('--ng-glow', a.showGlow ? '1' : '0');
  style.setProperty('--ng-noise', a.showNoise ? '1' : '0');

  root.dataset.theme = resolvedTheme(settings);
  root.dataset.noise = a.showNoise ? 'true' : 'false';
}

export function watchSystemTheme(settings: NetGaugeSettings, onChange: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => undefined;
  if (settings.appearance.theme !== 'system') return () => undefined;
  const query = window.matchMedia('(prefers-color-scheme: light)');
  const listener = () => onChange();
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}
