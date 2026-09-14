import { useEffect, useState } from 'react';
import { StoreProvider } from './lib/store';
import Studio from './views/Studio';
import Widget from './views/Widget';
import { bridge, isSimulated } from './lib/bridge';
import { useStore } from './lib/store';
import { applySettings } from './lib/theme';
import type { NetGaugeSettings, ViewName } from '../shared/bridge';

export function parseView(hash: string = window.location.hash): ViewName {
  const match = /#\/(studio|widget|test)/.exec(hash);
  return (match?.[1] as ViewName | undefined) ?? 'studio';
}

function PreviewSwitcher({ view }: { view: ViewName }) {
  if (!isSimulated) return null;
  return (
    <div className="ng-surface no-drag fixed right-4 bottom-4 z-50 flex gap-1 p-1.5" style={{ borderRadius: '999px' }}>
      {(['studio', 'widget', 'test'] as ViewName[]).map((option) => (
        <a
          key={option}
          href={`#/${option}`}
          className="ng-btn !px-3 !py-1 !text-[0.7rem] capitalize"
          style={view === option ? { color: 'var(--ng-accent)' } : undefined}
        >
          {option}
        </a>
      ))}
    </div>
  );
}

/**
 * Geometry of the browser-preview taskbar. Pure so it can be asserted directly:
 * jsdom rewrites `calc()` expressions when they are set as inline styles, so tests
 * must see the string the layout actually uses.
 *
 * `halfStart` is half the width of the Start cluster; the docked widget hangs
 * `dockGap` px to its left (or to its right when the user flips the alignment).
 */
export function previewDockStyle(
  settings: NetGaugeSettings,
  taskbarHeight = 48,
): { left: string; top: number; width: number; height: number } {
  const { dockAlign, dockGap, dockOffsetX, dockOffsetY, width, scale, dockThickness } = settings.widget;
  const scaledWidth = Math.round(width * scale);
  const scaledHeight = Math.round(dockThickness * scale);
  const beforeStart = dockAlign === 'before-start' || dockAlign === 'start';

  return {
    left: beforeStart
      ? `calc(50% - 120px - ${dockGap}px - ${scaledWidth}px + ${dockOffsetX}px)`
      : `calc(50% + 120px + ${dockGap}px + ${dockOffsetX}px)`,
    top: (taskbarHeight - scaledHeight) / 2 + dockOffsetY,
    width: scaledWidth,
    height: scaledHeight,
  };
}

/**
 * Browser-preview only: a fake Windows 11 taskbar with the widget docked where the
 * real one puts it — immediately to the LEFT of the Start button. Rendering it here
 * means the placement can be judged without a Windows machine.
 */
function PreviewTaskbar() {
  const { settings } = useStore();
  const style = previewDockStyle(settings);
  const icons = ['⊞', '⌕', '▢', '▤'];
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 h-12"
      style={{ background: 'rgb(18 22 32 / 0.94)', borderTop: '1px solid rgb(255 255 255 / 0.08)' }}
    >
      <div className="relative flex h-full items-center justify-center">
        <div className="flex items-center gap-1" style={{ color: 'rgb(255 255 255 / 0.6)', fontSize: 13 }}>
          {icons.map((glyph, index) => (
            <span
              key={glyph}
              className="flex h-8 w-9 items-center justify-center rounded"
              style={{ background: index === 0 ? 'rgb(255 255 255 / 0.1)' : 'rgb(255 255 255 / 0.04)' }}
            >
              {glyph}
            </span>
          ))}
        </div>

        <div className="pointer-events-auto absolute" data-dock={settings.widget.dockAlign} style={style}>
          <Widget />
        </div>
      </div>
    </div>
  );
}

/**
 * The widget hash is served by its own frameless Electron window. In a browser
 * preview it is rendered inside the page with a fake taskbar behind it, so the
 * docked layout can be judged without a Windows machine.
 */
export default function App() {
  const [view, setView] = useState<ViewName>(() => parseView());

  useEffect(() => {
    const onHash = () => setView(parseView());
    window.addEventListener('hashchange', onHash);
    const off = bridge.onOpenView((next) => setView(next));
    return () => {
      window.removeEventListener('hashchange', onHash);
      off();
    };
  }, []);

  const effective: ViewName = view === 'test' ? 'studio' : view;

  // `data-view` drives both the opaque Studio background and the widget's transparent
  // one. It must be set before the first paint of the view that needs it.
  useEffect(() => {
    document.body.dataset.view = effective;
    document.body.dataset.simulated = String(isSimulated);
    void bridge.getSettings().then(applySettings);
  }, [effective]);

  return (
    <StoreProvider>
      <div className="h-full" style={{ padding: isSimulated && effective !== 'widget' ? 16 : 0 }}>
        {effective === 'widget' ? (
          isSimulated ? (
            <>
              <div
                className="fixed inset-0"
                style={{
                  background:
                    'radial-gradient(120% 90% at 15% 0%, #12324f 0%, transparent 55%), radial-gradient(100% 80% at 90% 100%, #2a1a52 0%, transparent 60%), #05070d',
                }}
              />
              <div className="relative pt-10 text-center text-xs" style={{ color: 'rgb(255 255 255 / 0.45)' }}>
                The widget as it sits in the Windows taskbar — the strip below hangs just left of Start.
              </div>
              <PreviewTaskbar />
            </>
          ) : (
            <Widget />
          )
        ) : (
          <Studio initialTab={view === 'test' ? 'test' : 'live'} />
        )}
      </div>
      <PreviewSwitcher view={view} />
    </StoreProvider>
  );
}
