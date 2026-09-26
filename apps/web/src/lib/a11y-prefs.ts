export const A11Y_PREFS_KEY = 'anchor-a11y-prefs-v1';

export type TextScale = 100 | 125 | 150;

export type A11yPrefs = {
  textScale: TextScale;
  spacing: boolean;
  highContrast: boolean;
  underlineLinks: boolean;
  readableFont: boolean;
  reduceMotion: boolean;
  bigCursor: boolean;
  grayscale: boolean;
  hideImages: boolean;
};

export const DEFAULT_A11Y_PREFS: A11yPrefs = {
  textScale: 100,
  spacing: false,
  highContrast: false,
  underlineLinks: false,
  readableFont: false,
  reduceMotion: false,
  bigCursor: false,
  grayscale: false,
  hideImages: false,
};

const CLASS_MAP: Record<keyof A11yPrefs, (value: A11yPrefs[keyof A11yPrefs]) => string | null> = {
  textScale: (v) => (v === 100 ? null : `a11y-text-${v}`),
  spacing: (v) => (v ? 'a11y-spacing' : null),
  highContrast: (v) => (v ? 'a11y-contrast' : null),
  underlineLinks: (v) => (v ? 'a11y-underline-links' : null),
  readableFont: (v) => (v ? 'a11y-readable-font' : null),
  reduceMotion: (v) => (v ? 'a11y-reduce-motion' : null),
  bigCursor: (v) => (v ? 'a11y-big-cursor' : null),
  grayscale: (v) => (v ? 'a11y-grayscale' : null),
  hideImages: (v) => (v ? 'a11y-hide-images' : null),
};

const ALL_CLASSES = [
  'a11y-text-125',
  'a11y-text-150',
  'a11y-spacing',
  'a11y-contrast',
  'a11y-underline-links',
  'a11y-readable-font',
  'a11y-reduce-motion',
  'a11y-big-cursor',
  'a11y-grayscale',
  'a11y-hide-images',
];

export function normalizePrefs(raw: unknown): A11yPrefs {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_A11Y_PREFS };
  const input = raw as Partial<A11yPrefs>;
  const scale = input.textScale === 125 || input.textScale === 150 ? input.textScale : 100;
  return {
    textScale: scale,
    spacing: Boolean(input.spacing),
    highContrast: Boolean(input.highContrast),
    underlineLinks: Boolean(input.underlineLinks),
    readableFont: Boolean(input.readableFont),
    reduceMotion: Boolean(input.reduceMotion),
    bigCursor: Boolean(input.bigCursor),
    grayscale: Boolean(input.grayscale),
    hideImages: Boolean(input.hideImages),
  };
}

export function readA11yPrefs(): A11yPrefs {
  try {
    const raw = window.localStorage.getItem(A11Y_PREFS_KEY);
    if (!raw) return { ...DEFAULT_A11Y_PREFS };
    return normalizePrefs(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_A11Y_PREFS };
  }
}

export function writeA11yPrefs(prefs: A11yPrefs) {
  window.localStorage.setItem(A11Y_PREFS_KEY, JSON.stringify(prefs));
}

export function applyA11yPrefs(prefs: A11yPrefs, root: HTMLElement = document.documentElement) {
  root.classList.remove(...ALL_CLASSES);
  (Object.keys(CLASS_MAP) as (keyof A11yPrefs)[]).forEach((key) => {
    const className = CLASS_MAP[key](prefs[key]);
    if (className) root.classList.add(className);
  });
}
