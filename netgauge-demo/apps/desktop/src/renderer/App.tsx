import { useEffect, useState } from 'react';
import { StoreProvider } from './lib/store';
import Studio from './views/Studio';
import Widget from './views/Widget';
import { bridge, isSimulated } from './lib/bridge';
import type { ViewName } from '../shared/bridge';

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

  useEffect(() => {
    document.body.dataset.simulated = String(isSimulated);
  }, []);

  // `#/test` is the tray shortcut for "Studio, opened on the speed test tab".
  const effective: ViewName = view === 'test' ? 'studio' : view;

  return (
    <StoreProvider>
      <div className="h-full" style={{ padding: isSimulated ? 16 : 0 }}>
        {effective === 'widget' ? <Widget /> : <Studio initialTab={view === 'test' ? 'test' : 'live'} />}
      </div>
      <PreviewSwitcher view={view} />
    </StoreProvider>
  );
}
