import type { Incoming } from '../../core/types';
import { ADDRESS } from '../capture/filter';

// section 4.13: the words and clock times that let a group message reach the offer call
const HINT = /\b(remember|don['’]?t forget|do not forget|remind|when we leave|in the morning|tonight|tomorrow)|\b\d{1,2}[:.]\d{2}\b|\b\d{1,2}\s?[ap]m\b|\bat \d{1,2}\b|o['’]clock/i;

export const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export const DEFAULT_TIMES = ['08:00', '12:00', '18:00', '21:00'];

// a voice note never passes, because a gate on voice costs one transcription per group voice note
export function passesGate(event: Incoming): boolean {
  const text = event.text ?? '';
  return event.chat === 'group' && !event.voice && !text.startsWith('/') && !ADDRESS.test(text) && HINT.test(text);
}

/** The next local `HH:MM` after `now`. */
export function nextLocal(now: number, time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  const at = new Date(now);
  at.setHours(hours, minutes, 0, 0);
  if (at.getTime() <= now) at.setDate(at.getDate() + 1);
  return at.getTime();
}

/** One hour before, 30 minutes before, 30 minutes after, and one hour after, across midnight. */
export function around(time: string): string[] {
  const [hours, minutes] = time.split(':').map(Number);
  return [-60, -30, 30, 60].map((shift) => {
    const total = (hours * 60 + minutes + shift + 1440) % 1440;
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  });
}
