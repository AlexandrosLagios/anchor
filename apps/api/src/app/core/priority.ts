import type { Moment } from './types';

export function isAnniversary(eventDate: string | undefined, now: number): boolean {
  const match = eventDate?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const today = new Date(now);
  return Number(match[1]) < today.getFullYear() && Number(match[2]) === today.getMonth() + 1 && Number(match[3]) === today.getDate();
}

export function byPriority(now: number) {
  return (a: Moment, b: Moment) =>
    Number(isAnniversary(b.eventDate, now)) - Number(isAnniversary(a.eventDate, now)) ||
    b.salience - a.salience ||
    a.savedAt - b.savedAt;
}
