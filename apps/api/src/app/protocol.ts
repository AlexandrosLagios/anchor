export type Rating = 'free' | 'cued' | 'struggled';

export const ATHINA = {
  name: 'Athina',
  context:
    'Athina is 76 and lives with early mild cognitive impairment. Her daughter Sofia and granddaughter Maria share family life with her in a WhatsApp group. ' +
    'Anchor is an AI member of that group. It never quizzes her like a test: it brings family moments back gently, offers one cue when she hesitates, and never reports a lapse to the family.',
};

/** Starts at one day; free recall doubles the wait, a cue holds it, a struggle resets to tomorrow. */
export function rate(recalled: number, total: number, cued: boolean): Rating {
  if (recalled * 2 <= total) return 'struggled';
  return cued ? 'cued' : 'free';
}

export function nextGap(gapDays: number, rating: Rating): number {
  if (rating === 'free') return gapDays * 2;
  if (rating === 'cued') return gapDays;
  return 1;
}

export function scheduleNext(gapDays: number, from = new Date()): string {
  const next = new Date(from);
  next.setDate(next.getDate() + gapDays);
  next.setHours(11, 0, 0, 0);
  return next.toISOString();
}

/** The family only hears the good moment — never the lapse. */
export function familyNote(rating: Rating, memory: string): string | undefined {
  if (rating === 'struggled') return undefined;
  return `Athina remembered ${memory} today 💛`;
}
