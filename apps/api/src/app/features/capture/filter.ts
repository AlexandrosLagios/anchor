import type { Incoming, Person } from '../../core/types';

const LINK = /\b(?:https?:\/\/|www\.)\S+/gi;

export function wordCount(text: string | undefined): number {
  return (text ?? '').replace(LINK, ' ').split(/\s+/).filter(Boolean).length;
}

export const BUNDLE_GAP_MS = 120_000;

export type Bundle = {
  familyId: string;
  sender: Person;
  events: Incoming[];
  closing?: boolean; // the classification runs
  sensitive?: boolean; // a keep-quiet arrived before the bundle closed (R5)
};

export function passesRules(event: Incoming): boolean {
  if (event.unsupported || event.forwarded) return false;
  if (event.button !== undefined || event.joined || event.migratedTo !== undefined) return false;
  if (event.text?.startsWith('/')) return false;
  return Boolean(event.photo || event.video || event.voice || wordCount(event.text) > 0);
}

export function isClosed(bundle: Bundle, realNow: number): boolean {
  const last = bundle.events[bundle.events.length - 1];
  if (realNow - last.at >= BUNDLE_GAP_MS) return true;
  const hasMedia = bundle.events.some((event) => event.photo || event.video);
  const hasWords = bundle.events.some((event) => event.voice || wordCount(event.text) > 0);
  return hasMedia && hasWords;
}

export function worthClassifying(bundle: Bundle): boolean {
  const hasMedia = bundle.events.some((event) => event.photo || event.video);
  const hasVoice = bundle.events.some((event) => event.voice);
  const words = bundle.events.reduce((total, event) => total + wordCount(event.text), 0);
  if (!hasMedia && !hasVoice && words < 3) return false;
  if (hasMedia && words === 0 && !hasVoice) return false;
  return true;
}

export function typedText(bundle: Bundle): string {
  return bundle.events
    .map((event) => event.text)
    .filter((text): text is string => Boolean(text))
    .join('\n');
}
