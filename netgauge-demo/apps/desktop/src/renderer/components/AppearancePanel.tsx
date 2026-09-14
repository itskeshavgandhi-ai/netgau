import { useState } from 'react';
import { formatSpeed } from '@netgauge/core';
import { useStore } from '../lib/store';
import { FontPicker, Row, SectionCard, Select, Slider, Swatches, Toggle } from './controls';
import type { GlassMode, ThemeMode } from '../../shared/bridge';

type FontSlot = 'ui' | 'display' | 'mono';

export default function AppearancePanel() {
  const { settings, update } = useStore();
  const a = settings.appearance;
  const [slot, setSlot] = useState<FontSlot>('display');
  const patch = (partial: Partial<typeof a>) => void update({ appearance: { ...a, ...partial } });

  return (
    <div className="space-y-4">
      <div className="ng-panel relative overflow-hidden p-6">
        <div className="ng-glow" />
        <p className="ng-chip">Preview</p>
        <p className="display mt-3 text-[2.6rem] leading-none" style={{ fontFamily: a.displayFont }}>
          312.4 <span className="text-base" style={{ color: 'var(--ng-muted)' }}>Mbps</span>
        </p>
        <p className="mt-2 text-sm" style={{ fontFamily: a.uiFont, color: 'var(--ng-muted)' }}>
          The quick brown fox jumps over the lazy dog — {formatSpeed(24_100_000, settings.monitor.unit).text} upload
        </p>
        <p className="num mt-2 text-xs" style={{ fontFamily: a.monoFont, color: 'var(--ng-faint)' }}>
          0123456789 · ↓ 312.40 ↑ 24.10 · 8 ms · Wi-Fi
        </p>
      </div>

      <SectionCard title="Material" description="Acrylic and mica are real Windows 11 compositor materials; the others work everywhere.">
        <Row label="Theme">
          <Select<ThemeMode>
            label="Theme"
            value={a.theme}
            onChange={(theme) => patch({ theme })}
            options={[
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' },
              { value: 'system', label: 'Follow system' },
            ]}
          />
        </Row>
        <Row label="Window material" hint="Changing this rebuilds the window.">
          <Select<GlassMode>
            label="Window material"
            value={a.glass}
            onChange={(glass) => patch({ glass })}
            options={[
              { value: 'acrylic', label: 'Acrylic (Windows 11)' },
              { value: 'mica', label: 'Mica (Windows 11)' },
              { value: 'transparent', label: 'Transparent' },
              { value: 'solid', label: 'Solid' },
            ]}
          />
        </Row>
        <Row label="Opacity" hint="How much of the desktop shows through.">
          <Slider label="Opacity" value={a.opacity} min={0.15} max={1} step={0.01} onChange={(opacity) => patch({ opacity })} format={(v) => `${Math.round(v * 100)}%`} />
        </Row>
        <Row label="Background blur">
          <Slider label="Blur" value={a.blur} min={0} max={60} onChange={(blur) => patch({ blur })} format={(v) => `${v}px`} />
        </Row>
        <Row label="Corner radius">
          <Slider label="Corner radius" value={a.cornerRadius} min={0} max={32} onChange={(cornerRadius) => patch({ cornerRadius })} format={(v) => `${v}px`} />
        </Row>
        <Row label="Accent colour">
          <Swatches value={a.accent} onChange={(accent) => patch({ accent })} />
        </Row>
        <Row label="Accent glow" hint="Soft accent light behind the numbers.">
          <Toggle label="Accent glow" checked={a.showGlow} onChange={(showGlow) => patch({ showGlow })} />
        </Row>
        <Row label="Film grain" hint="A subtle noise layer that keeps flat glass from banding.">
          <Toggle label="Film grain" checked={a.showNoise} onChange={(showNoise) => patch({ showNoise })} />
        </Row>
      </SectionCard>

      <SectionCard title="Typography" description="Twelve bundled typefaces — no downloads, works offline.">
        <div className="mb-3 flex gap-2">
          {(['display', 'ui', 'mono'] as FontSlot[]).map((option) => (
            <button
              key={option}
              type="button"
              className="ng-btn no-drag capitalize"
              onClick={() => setSlot(option)}
              style={
                slot === option
                  ? { borderColor: 'color-mix(in oklab, var(--ng-accent) 60%, transparent)', color: 'var(--ng-accent)' }
                  : undefined
              }
            >
              {option === 'ui' ? 'Interface' : option}
            </button>
          ))}
        </div>

        <FontPicker
          value={slot === 'ui' ? a.uiFont : slot === 'display' ? a.displayFont : a.monoFont}
          kinds={slot === 'mono' ? ['mono'] : undefined}
          onChange={(family) =>
            patch(slot === 'ui' ? { uiFont: family } : slot === 'display' ? { displayFont: family } : { monoFont: family })
          }
        />

        <Row label="Type scale">
          <Slider label="Type scale" value={a.fontScale} min={0.8} max={1.4} step={0.01} onChange={(fontScale) => patch({ fontScale })} format={(v) => `${Math.round(v * 100)}%`} />
        </Row>
        <Row label="Weight">
          <Slider label="Font weight" value={a.fontWeight} min={300} max={700} step={50} onChange={(fontWeight) => patch({ fontWeight })} />
        </Row>
        <Row label="Letter spacing">
          <Slider label="Letter spacing" value={a.letterSpacing} min={-0.05} max={0.12} step={0.005} onChange={(letterSpacing) => patch({ letterSpacing })} format={(v) => `${v.toFixed(3)}em`} />
        </Row>
      </SectionCard>
    </div>
  );
}
