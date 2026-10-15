import { useId, useRef, type ReactNode } from "react";

export function Section({ title, children, aside }: { title?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="ins-section">
      {(title || aside) && (
        <header className="ins-section-head">
          {title && <h3>{title}</h3>}
          {aside}
        </header>
      )}
      {children}
    </section>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
  size = "md",
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  label: string;
  size?: "md" | "sm";
}) {
  return (
    <div className={`segmented segmented-${size}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          title={o.title}
          className={o.value === value ? "is-on" : undefined}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  onCommit,
  format,
  defaultValue,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  /** fired when the user lets go */
  onCommit?: (v: number) => void;
  format?: (v: number) => string;
  defaultValue?: number;
}) {
  const id = useId();
  const pct = ((value - min) / (max - min)) * 100;
  const zero = defaultValue !== undefined ? ((defaultValue - min) / (max - min)) * 100 : 0;
  const last = useRef(value);
  last.current = value;
  const dragging = useRef(false);
  const commit = () => {
    dragging.current = false;
    onCommit?.(last.current);
  };
  // A drag can end outside the input; listen on the window so it always commits.
  const startDrag = () => {
    if (dragging.current) return;
    dragging.current = true;
    const end = () => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      // let the final change event land first
      setTimeout(commit, 0);
    };
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };
  return (
    <div className="slider">
      <div className="slider-head">
        <label htmlFor={id}>{label}</label>
        <output
          htmlFor={id}
          onDoubleClick={() => {
            if (defaultValue === undefined) return;
            onChange(defaultValue);
            onCommit?.(defaultValue);
          }}
          title={defaultValue !== undefined ? "Double-click to reset" : undefined}
        >
          {format ? format(value) : value}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ ["--lo" as string]: `${Math.min(zero, pct)}%`, ["--hi" as string]: `${Math.max(zero, pct)}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerDown={startDrag}
        onKeyUp={commit}
      />
    </div>
  );
}

export function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="select">
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <svg viewBox="0 0 12 12" aria-hidden="true">
          <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="row">
      <span className="row-label">{label}</span>
      {children}
    </div>
  );
}

export const Icon = {
  upload: (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 11V2.5M4.5 6 8 2.5 11.5 6M2.5 10.5v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  download: (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 2.5V11M4.5 7.5 8 11l3.5-3.5M2.5 10.5v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  reset: (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2.8 6.5A5.5 5.5 0 1 1 3 10M2.5 2.8v3.9h3.9" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  mirror: (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 1.5v13M5.5 4 2 8l3.5 4M10.5 4 14 8l-3.5 4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  copy: (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10.5 3.5v-.5a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v6.5a1 1 0 0 0 1 1h.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  ),
  arrow: (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  undo: (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M5.5 3 2.5 6l3 3M2.5 6H10a3.5 3.5 0 0 1 0 7H7" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  redo: (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M10.5 3l3 3-3 3M13.5 6H6a3.5 3.5 0 0 0 0 7h3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  view: (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 2 13.5 5v6L8 14l-5.5-3V5L8 2Zm0 0v6m0 0 5.5-3M8 8 2.5 5M8 8v6" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  ),
};

export function Logo({ size = 18 }: { size?: number }) {
  // Three stacked blocks in isometric: the mark is a cube.
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <path d="M10 1.5 17.5 5.75 10 10 2.5 5.75Z" fill="#1d1d1f" />
      <path d="M2.5 5.75 10 10v8.5L2.5 14.25Z" fill="#6e6e73" />
      <path d="M17.5 5.75 10 10v8.5l7.5-4.25Z" fill="#b0b0b6" />
    </svg>
  );
}
