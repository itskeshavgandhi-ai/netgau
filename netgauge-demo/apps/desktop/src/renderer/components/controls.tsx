import type { ReactNode } from 'react';
import { ACCENTS, FONT_CHOICES } from '../lib/fonts';

export function SectionCard({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="ng-panel p-5">
      <header className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="display text-[0.95rem] font-semibold">{title}</h3>
          {description && <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--ng-muted)' }}>{description}</p>}
        </div>
        {action}
      </header>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <div className="min-w-0">
        <p className="text-[0.8rem] font-medium">{label}</p>
        {hint && <p className="mt-0.5 text-[0.68rem] leading-snug" style={{ color: 'var(--ng-faint)' }}>{hint}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="ng-toggle no-drag"
      data-on={checked}
      onClick={() => onChange(!checked)}
    />
  );
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
  label,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
  label: string;
}) {
  return (
    <div className="flex w-44 items-center gap-3">
      <input
        type="range"
        className="ng-range no-drag"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="num w-14 text-right text-[0.7rem]" style={{ color: 'var(--ng-muted)' }}>
        {format ? format(value) : value}
      </span>
    </div>
  );
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <select
      className="ng-select no-drag w-44"
      value={value}
      aria-label={label}
      onChange={(event) => onChange(event.target.value as T)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value} style={{ color: '#0b1120' }}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  label,
  className = 'w-56',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label: string;
  className?: string;
}) {
  return (
    <input
      className={`ng-input no-drag ${className}`}
      value={value}
      placeholder={placeholder}
      aria-label={label}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export function Swatches({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {ACCENTS.map((accent) => (
        <button
          key={accent.id}
          type="button"
          title={accent.label}
          aria-label={accent.label}
          onClick={() => onChange(accent.hex)}
          className="no-drag h-7 w-7 rounded-full border transition-transform hover:scale-110"
          style={{
            background: accent.hex,
            borderColor: value.toLowerCase() === accent.hex ? '#fff' : 'rgba(255,255,255,0.2)',
            boxShadow: value.toLowerCase() === accent.hex ? `0 0 0 2px ${accent.hex}55` : undefined,
          }}
        />
      ))}
      <label className="ng-chip no-drag cursor-pointer">
        Custom
        <input
          type="color"
          value={value}
          aria-label="Custom accent colour"
          onChange={(event) => onChange(event.target.value)}
          className="h-4 w-5 cursor-pointer border-0 bg-transparent p-0"
        />
      </label>
    </div>
  );
}

export function FontPicker({
  value,
  onChange,
  kinds,
}: {
  value: string;
  onChange: (family: string) => void;
  kinds?: Array<'ui' | 'display' | 'mono'>;
}) {
  const choices = FONT_CHOICES.filter((font) => !kinds || kinds.includes(font.kind));
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {choices.map((font) => {
        const active = font.family === value;
        return (
          <button
            key={font.id}
            type="button"
            onClick={() => onChange(font.family)}
            className="no-drag rounded-xl border px-3 py-2.5 text-left transition"
            style={{
              borderColor: active ? 'color-mix(in oklab, var(--ng-accent) 65%, transparent)' : 'rgb(var(--ng-hairline) / 0.1)',
              background: active ? 'color-mix(in oklab, var(--ng-accent) 12%, transparent)' : 'rgb(var(--ng-hairline) / 0.03)',
            }}
          >
            <span className="block text-[1.05rem] leading-tight" style={{ fontFamily: font.family }}>
              {font.label}
            </span>
            <span className="num block text-[0.7rem] mt-0.5" style={{ fontFamily: font.family, color: 'var(--ng-accent)' }}>
              1 4 8 24.6 Mbps
            </span>
            {font.note && (
              <span className="block text-[0.62rem] mt-1" style={{ color: 'var(--ng-faint)' }}>
                {font.note}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function Stat({
  label,
  value,
  unit,
  color,
  icon,
}: {
  label: string;
  value: string;
  unit?: string;
  color?: string;
  icon?: 'up' | 'down';
}) {
  return (
    <div className="ng-panel px-4 py-3">
      <p
        className="flex items-center gap-1 text-[0.6rem] font-semibold tracking-[0.16em] uppercase"
        style={{ color: color ?? 'var(--ng-faint)' }}
      >
        {icon && (
          <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d={icon === 'down' ? 'M8 2v9m0 0 4-4m-4 4-4-4' : 'M8 14V5m0 0 4 4m-4-4-4 4'} />
          </svg>
        )}
        {label}
      </p>
      <p className="mt-1 flex items-baseline gap-1">
        <span className="display text-[1.6rem] leading-none" style={{ color: color }}>
          {value}
        </span>
        {unit && <span className="text-[0.68rem]" style={{ color: 'var(--ng-muted)' }}>{unit}</span>}
      </p>
    </div>
  );
}
