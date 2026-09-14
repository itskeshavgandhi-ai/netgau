import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_SETTINGS,
  type DockAlign,
  type TaskbarProbeResult,
  type WidgetDock,
  type WidgetLayout,
} from '../../shared/bridge';
import { bridge } from '../lib/bridge';
import { useStore } from '../lib/store';
import { Row, SectionCard, Select, Slider, Toggle } from './controls';

const ALIGNMENTS: ReadonlyArray<{ value: DockAlign; label: string }> = [
  { value: 'before-start', label: 'Left of Start' },
  { value: 'after-start', label: 'Right of Start' },
  { value: 'start', label: 'Taskbar start (far left)' },
  { value: 'center', label: 'Centred in the taskbar' },
  { value: 'tray', label: 'Next to the clock' },
];

/** Arrow buttons + a readout, for shaving the last few pixels off the placement. */
function Nudge({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  step?: number;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n)));
  return (
    <div className="flex items-center gap-2">
      <button type="button" className="ng-btn !px-2 !py-0.5" aria-label={`${label} left`} onClick={() => onChange(clamp(value - step))}>
        ◀
      </button>
      <span className="num w-16 text-center text-[0.7rem]" style={{ color: 'var(--ng-muted)' }}>
        {value > 0 ? `+${value}` : value} px
      </span>
      <button type="button" className="ng-btn !px-2 !py-0.5" aria-label={`${label} right`} onClick={() => onChange(clamp(value + step))}>
        ▶
      </button>
      {step < 10 && (
        <>
          <button type="button" className="ng-btn !px-2 !py-0.5" aria-label={`${label} fast`} onClick={() => onChange(clamp(value - 10))}>
            ◀◀
          </button>
          <button type="button" className="ng-btn !px-2 !py-0.5" aria-label={`${label} fast right`} onClick={() => onChange(clamp(value + 10))}>
            ▶▶
          </button>
        </>
      )}
    </div>
  );
}

export default function WidgetPanel() {
  const { settings, update, simulated } = useStore();
  const w = settings.widget;
  const patch = (partial: Partial<typeof w>) => void update({ widget: partial });
  const [probe, setProbe] = useState<TaskbarProbeResult | null>(null);
  const [probing, setProbing] = useState(false);

  const detect = useCallback(async () => {
    setProbing(true);
    try {
      setProbe(await bridge.probeTaskbar());
    } catch {
      setProbe(null);
    } finally {
      setProbing(false);
    }
  }, []);

  useEffect(() => {
    void detect();
  }, [detect]);

  const docked = w.dock === 'taskbar';

  return (
    <div className="space-y-4">
      <SectionCard
        title="Taskbar widget"
        description="The strip that sits in the Windows taskbar and shows the live upload and download rate."
      >
        <Row label="Show widget">
          <Toggle label="Show widget" checked={w.enabled} onChange={(enabled) => patch({ enabled })} />
        </Row>
        <Row label="Placement" hint="Docked pins the widget inside the taskbar; floating puts it anywhere on screen.">
          <Select<WidgetDock>
            label="Placement"
            value={w.dock}
            onChange={(dock) => patch({ dock, position: dock === 'floating' ? w.position : null })}
            options={[
              { value: 'taskbar', label: 'In the taskbar' },
              { value: 'floating', label: 'Floating on screen' },
            ]}
          />
        </Row>
        <Row label="Layout" hint="Auto follows the placement: a one-line strip when docked, an information card when floating.">
          <Select<WidgetLayout>
            label="Layout"
            value={w.layout}
            onChange={(layout) => patch({ layout })}
            options={[
              { value: 'auto', label: 'Auto' },
              { value: 'taskbar', label: 'One-line strip' },
              { value: 'card', label: 'Information card' },
            ]}
          />
        </Row>
        <Row label="Keep on top" hint="Above the taskbar and every other window.">
          <Toggle label="Keep on top" checked={w.alwaysOnTop} onChange={(alwaysOnTop) => patch({ alwaysOnTop })} />
        </Row>
        <Row label="Click-through" hint="Clicks fall through to the taskbar underneath.">
          <Toggle label="Click-through" checked={w.clickThrough} onChange={(clickThrough) => patch({ clickThrough })} />
        </Row>
      </SectionCard>

      {docked && (
        <SectionCard
          title="Position in the taskbar"
          description="Left of Start is the default. Drag the strip itself to fine-tune — the nudge below updates as you drag, and is remembered."
        >
          <Row label="Placement">
            <Select<DockAlign>
              label="Placement in taskbar"
              value={w.dockAlign}
              onChange={(dockAlign) => patch({ dockAlign, dockOffsetX: 0, dockOffsetY: 0 })}
              options={ALIGNMENTS}
            />
          </Row>
          <Row label="Horizontal nudge" hint="Positive moves right.">
            <Nudge label="Horizontal nudge" value={w.dockOffsetX} min={-1200} max={1200} onChange={(dockOffsetX) => patch({ dockOffsetX })} />
          </Row>
          <Row label="Vertical nudge" hint="Positive moves down.">
            <Nudge label="Vertical nudge" value={w.dockOffsetY} min={-60} max={60} onChange={(dockOffsetY) => patch({ dockOffsetY })} />
          </Row>
          <Row label="Gap from Start">
            <Slider
              label="Gap from Start"
              value={w.dockGap}
              min={0}
              max={60}
              onChange={(dockGap) => patch({ dockGap })}
              format={(v) => `${v} px`}
            />
          </Row>
          <Row label="Strip height" hint="Windows 11's taskbar is 48 px; 34–40 keeps a comfortable margin.">
            <Slider
              label="Strip height"
              value={w.dockThickness}
              min={24}
              max={60}
              onChange={(dockThickness) => patch({ dockThickness })}
              format={(v) => `${v} px`}
            />
          </Row>
          <Row label="Strip width">
            <Slider label="Strip width" value={w.width} min={180} max={640} step={10} onChange={(width) => patch({ width })} format={(v) => `${v} px`} />
          </Row>
          <Row label="Auto-hidden taskbar" hint="What to do when the taskbar slides away.">
            <Select<'follow' | 'keep'>
              label="Auto-hidden taskbar"
              value={w.dockAutoHide}
              onChange={(dockAutoHide) => patch({ dockAutoHide })}
              options={[
                { value: 'follow', label: 'Hide with the taskbar' },
                { value: 'keep', label: 'Keep it on screen' },
              ]}
            />
          </Row>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button type="button" className="ng-btn no-drag" disabled={probing} onClick={() => void detect()}>
              {probing ? 'Detecting…' : 'Detect taskbar'}
            </button>
            <button
              type="button"
              className="ng-btn no-drag"
              onClick={() => patch({ dockOffsetX: 0, dockOffsetY: 0, position: null })}
            >
              Reset position
            </button>
            {probe?.layout && (
              <span className="num text-[0.66rem]" style={{ color: 'var(--ng-faint)' }}>
                {probe.layout.edge} · {probe.layout.thickness} px ·{' '}
                {probe.layout.source === 'uia' ? 'UI Automation' : 'work-area estimate'} ·{' '}
                {probe.layout.alignment === 'center' ? 'centred icons' : 'left-aligned icons'}
                {probe.layout.startButton ? ` · Start at x=${probe.layout.startButton.x}` : ' · Start position estimated'}
                {probe.rect ? ` · widget → x=${probe.rect.x}, y=${probe.rect.y}` : ''}
              </span>
            )}
          </div>
          {simulated && (
            <p className="text-[0.66rem]" style={{ color: 'var(--ng-faint)' }}>
              Browser preview: the taskbar geometry shown is a Windows 11 mock-up. In the app this reads the real
              taskbar through UI Automation.
            </p>
          )}
        </SectionCard>
      )}

      <SectionCard title="Widget contents" description="Exactly which numbers the strip shows.">
        <Row label="Live sparkline">
          <Toggle label="Live sparkline" checked={w.showSparkline} onChange={(showSparkline) => patch({ showSparkline })} />
        </Row>
        <Row label="Peak download">
          <Toggle label="Peak download" checked={w.showPeak} onChange={(showPeak) => patch({ showPeak })} />
        </Row>
        <Row label="Adapter name">
          <Toggle label="Adapter name" checked={w.showAdapter} onChange={(showAdapter) => patch({ showAdapter })} />
        </Row>
        <Row label="Scale">
          <Slider
            label="Scale"
            value={w.scale}
            min={0.7}
            max={1.8}
            step={0.05}
            onChange={(scale) => patch({ scale })}
            format={(v) => `${Math.round(v * 100)}%`}
          />
        </Row>
        {!docked && (
          <Row label="Position" hint={w.position ? `Remembered at ${Math.round(w.position.x)}, ${Math.round(w.position.y)}` : 'Not moved yet — it opens bottom-right.'}>
            <button type="button" className="ng-btn no-drag" onClick={() => patch({ position: null })}>
              Reset position
            </button>
          </Row>
        )}
      </SectionCard>

      <SectionCard title="Reset" description="Put the widget back exactly how it ships.">
        <button
          type="button"
          className="ng-btn no-drag"
          onClick={() => void update({ widget: DEFAULT_SETTINGS.widget })}
        >
          Reset widget settings
        </button>
      </SectionCard>
    </div>
  );
}
