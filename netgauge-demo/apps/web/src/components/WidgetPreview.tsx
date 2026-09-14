/** Static, dependency-free preview of the desktop widget — no screenshots to keep stale. */
export default function WidgetPreview() {
  return (
    <div className="relative mx-auto w-full max-w-md">
      <div className="glass rounded-[22px] p-4 shadow-[0_40px_120px_-40px_rgba(34,211,238,0.35)]">
        <div className="flex items-center justify-between">
          <span className="chip !text-[10px]">Live</span>
          <div className="flex gap-1.5">
            <span className="h-2 w-2 rounded-full bg-white/20" />
            <span className="h-2 w-2 rounded-full bg-white/20" />
            <span className="h-2 w-2 rounded-full bg-white/20" />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <p className="flex items-center gap-1 text-[10px] font-semibold tracking-[0.16em] text-cyan uppercase">
              <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M8 2v9m0 0 4-4m-4 4-4-4" />
              </svg>
              Down
            </p>
            <p className="num mt-1 text-2xl text-mist">
              312.4<span className="ml-1 text-xs text-muted">Mbps</span>
            </p>
          </div>
          <div>
            <p className="flex items-center gap-1 text-[10px] font-semibold tracking-[0.16em] text-violet uppercase">
              <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M8 14V5m0 0 4 4m-4-4-4 4" />
              </svg>
              Up
            </p>
            <p className="num mt-1 text-2xl text-mist">
              24.1<span className="ml-1 text-xs text-muted">Mbps</span>
            </p>
          </div>
        </div>

        <svg viewBox="0 0 220 44" className="mt-4 h-11 w-full" preserveAspectRatio="none" aria-hidden>
          <defs>
            <linearGradient id="preview-stroke" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#22d3ee" />
              <stop offset="100%" stopColor="#a78bfa" />
            </linearGradient>
            <linearGradient id="preview-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M0 34 L18 30 L36 32 L54 22 L72 26 L90 14 L108 19 L126 10 L144 16 L162 8 L180 13 L198 6 L220 11 L220 44 L0 44 Z"
            fill="url(#preview-fill)"
          />
          <path
            d="M0 34 L18 30 L36 32 L54 22 L72 26 L90 14 L108 19 L126 10 L144 16 L162 8 L180 13 L198 6 L220 11"
            fill="none"
            stroke="url(#preview-stroke)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>

        <div className="mt-3 flex items-center justify-between border-t border-white/[0.07] pt-3">
          <span className="num text-[10px] text-faint">Wi-Fi · 8 ms · 0.4% loss</span>
          <span className="text-[10px] font-medium text-cyan">Speed test</span>
        </div>
      </div>

      {/* faux taskbar with the live tray icon */}
      <div className="glass-soft mx-auto mt-3 flex h-11 w-[92%] items-center justify-end gap-3 rounded-full px-4">
        <span className="num text-[10px] text-muted">↑ 24.1</span>
        <span className="num text-[10px] text-cyan">↓ 312.4</span>
        <span className="h-px w-px" />
        <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
          {[0.3, 0.55, 0.8, 1].map((h, i) => (
            <rect
              key={i}
              x={1.6 + i * 3.4}
              y={14 - h * 12}
              width="2.4"
              height={h * 12}
              rx="1"
              fill={i < 3 ? '#22d3ee' : 'rgba(255,255,255,0.22)'}
            />
          ))}
        </svg>
        <span className="num text-[10px] text-muted">14:32</span>
      </div>
    </div>
  );
}
