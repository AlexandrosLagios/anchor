import { useEffect, useId, useRef, useState } from 'react';
import {
  applyA11yPrefs,
  DEFAULT_A11Y_PREFS,
  readA11yPrefs,
  writeA11yPrefs,
  type A11yPrefs,
  type TextScale,
} from '../lib/a11y-prefs';
import './AccessibilityWidget.css';

type ToggleKey = Exclude<keyof A11yPrefs, 'textScale'>;

const TOGGLES: { key: ToggleKey; label: string }[] = [
  { key: 'highContrast', label: 'High contrast' },
  { key: 'underlineLinks', label: 'Underline links' },
  { key: 'readableFont', label: 'Readable font' },
  { key: 'spacing', label: 'Larger spacing' },
  { key: 'reduceMotion', label: 'Reduce motion' },
  { key: 'bigCursor', label: 'Bigger cursor' },
  { key: 'grayscale', label: 'Grayscale' },
  { key: 'hideImages', label: 'Hide images' },
];

export function AccessibilityWidget() {
  const panelId = useId();
  const titleId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<A11yPrefs>(DEFAULT_A11Y_PREFS);

  useEffect(() => {
    const saved = readA11yPrefs();
    setPrefs(saved);
    applyA11yPrefs(saved);
  }, []);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
      }
    }

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    }

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  function commit(next: A11yPrefs) {
    setPrefs(next);
    writeA11yPrefs(next);
    applyA11yPrefs(next);
  }

  function setScale(textScale: TextScale) {
    commit({ ...prefs, textScale });
  }

  function toggle(key: ToggleKey) {
    commit({ ...prefs, [key]: !prefs[key] });
  }

  function reset() {
    commit({ ...DEFAULT_A11Y_PREFS });
  }

  return (
    <div className="a11y-widget">
      <button
        ref={buttonRef}
        type="button"
        className="a11y-widget-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="a11y-widget-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="4.5" r="2.25" />
            <path d="M4 9.5h16M12 9.5v11M7.5 20.5 12 13l4.5 7.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span>Accessibility</span>
      </button>

      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          className="a11y-widget-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
        >
          <div className="a11y-widget-head">
            <h2 id={titleId}>Accessibility options</h2>
            <button type="button" className="a11y-widget-close" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>

          <p className="a11y-widget-lead">
            Personal display settings for this device. They do not replace the site’s built-in accessibility.
          </p>

          <fieldset className="a11y-widget-fieldset">
            <legend>Text size</legend>
            <div className="a11y-widget-scale" role="group" aria-label="Text size">
              <button
                type="button"
                className={prefs.textScale === 100 ? 'is-active' : undefined}
                aria-pressed={prefs.textScale === 100}
                onClick={() => setScale(100)}
              >
                Default
              </button>
              <button
                type="button"
                className={prefs.textScale === 125 ? 'is-active' : undefined}
                aria-pressed={prefs.textScale === 125}
                onClick={() => setScale(125)}
              >
                Larger
              </button>
              <button
                type="button"
                className={prefs.textScale === 150 ? 'is-active' : undefined}
                aria-pressed={prefs.textScale === 150}
                onClick={() => setScale(150)}
              >
                Largest
              </button>
            </div>
          </fieldset>

          <ul className="a11y-widget-list">
            {TOGGLES.map(({ key, label }) => (
              <li key={key}>
                <label className="a11y-widget-switch">
                  <input type="checkbox" checked={prefs[key]} onChange={() => toggle(key)} />
                  <span>{label}</span>
                </label>
              </li>
            ))}
          </ul>

          <button type="button" className="btn btn-secondary a11y-widget-reset" onClick={reset}>
            Reset all
          </button>
        </div>
      ) : null}
    </div>
  );
}
