import type { Family, Incoming, Media, Moment, Person } from '../../core/types';

const LINK = /\b(?:https?:\/\/|www\.)\S+/gi;

export function wordCount(text: string | undefined): number {
  return (text ?? '').replace(LINK, ' ').split(/\s+/).filter(Boolean).length;
}

export const BUNDLE_GAP_MS = 5 * 60_000;
export const ALBUM_GRACE_MS = 3000; // Telegram delivers album items one update apart, and `at` has 1 s resolution

export type Bundle = {
  family: Family; // a reference, so the bundle still matches after a migration changes family.id
  sender: Person;
  events: Incoming[];
  closing?: boolean; // the classification runs
  sensitive?: boolean; // a keep-quiet arrived before the bundle closed (R5)
  sealed?: boolean; // a newer picture from the sender started its own bundle
};

export const hasPicture = (event: Incoming) => Boolean(event.photo || event.video);

export const ADDRESS = /^anchor\b[,:]?\s+/i;

// v2: these phrases decide an intent in code, before any model call, so the demo phrases never depend on the model
const FIXED = /^(?:(?:can|could|would|will) you |please )?(send me|another moment|my settings|settings|call me|what did i miss)\b/i;
const FIXED_INTENTS = {
  'send me': 'sendMe',
  'another moment': 'sendMe',
  'my settings': 'settings',
  settings: 'settings',
  'call me': 'callMe',
  'what did i miss': 'missed',
} as const;

export function fixedIntent(text: string | undefined): (typeof FIXED_INTENTS)[keyof typeof FIXED_INTENTS] | 'stop' | undefined {
  const phrase = text?.trim() ?? '';
  if (/^stop[.!]?$/i.test(phrase)) return 'stop';
  const match = FIXED.exec(phrase)?.[1].toLowerCase() as keyof typeof FIXED_INTENTS | undefined;
  return match ? FIXED_INTENTS[match] : undefined;
}

export const isCommand = (text: string | undefined, command: string) => text === command || !!text?.startsWith(`${command} `);

export function pictureOf(moment: Moment): { photo: Media } | { video: Media } | undefined {
  return moment.video ? { video: moment.video } : moment.photo ? { photo: moment.photo } : undefined;
}

export function passesRules(event: Incoming): boolean {
  if (event.unsupported || event.forwarded) return false;
  if (event.button !== undefined || event.joined || event.migratedTo !== undefined) return false;
  if (event.text?.startsWith('/')) return false;
  return hasPicture(event) || Boolean(event.voice) || wordCount(event.text) > 0;
}

export function isClosed(bundle: Bundle, realNow: number): boolean {
  if (bundle.sealed) return true;
  const last = bundle.events[bundle.events.length - 1];
  if (realNow - last.at >= BUNDLE_GAP_MS) return true;
  if (last.albumId !== undefined && realNow - last.at < ALBUM_GRACE_MS) return false;
  const hasWords = bundle.events.some((event) => event.voice || wordCount(event.text) > 0);
  return bundle.events.some(hasPicture) && hasWords;
}

export function worthClassifying(bundle: Bundle): boolean {
  const hasVoice = bundle.events.some((event) => event.voice);
  const words = bundle.events.reduce((total, event) => total + wordCount(event.text), 0);
  if (!bundle.events.some(hasPicture) && !hasVoice && words < 3) return false;
  const showsPicture = bundle.events.some((event) => event.photo || (event.video && event.thumbnail));
  return showsPicture || hasVoice || words > 0;
}

export function typedText(bundle: Bundle): string {
  return bundle.events
    .map((event) => event.text)
    .filter((text): text is string => Boolean(text))
    .join('\n');
}
