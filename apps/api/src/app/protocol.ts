export type Rating = 'free' | 'cued' | 'struggled';

export const MARIA = {
  name: 'Μαρία',
  context:
    'Maria is 78, lives in Athens and has mild cognitive impairment. Her daughter is Sofia. Her granddaughter Anna is Sofia\'s daughter. ' +
    'Her husband Yiannis has passed away. Her favourite song is "Συννεφιασμένη Κυριακή".',
  story: {
    title: 'Η μέρα του γάμου της',
    summary: 'Maria married Yiannis in the small church (εκκλησάκι) on Aegina. Yiannis was trembling with nerves. Her mother sewed her dress.',
    elements: ['Ο Γιάννης', 'Το εκκλησάκι στην Αίγινα', 'Η αγωνία του Γιάννη', 'Το νυφικό από τη μητέρα της'],
  },
};

export const LINES = {
  greeting: 'Καλημέρα Μαρία, εδώ το Anchor. Πες μου για τη μέρα του γάμου σου.',
  bridge: 'Τι όμορφη ιστορία.',
  goodbye: 'Σ\' ευχαριστώ, Μαρία. Τα λέμε σύντομα. Να έχεις μια όμορφη μέρα.',
};

export function rate(recalled: number, total: number, cued: boolean): Rating {
  if (recalled * 2 <= total) return 'struggled';
  return cued ? 'cued' : 'free';
}

export function nextGap(gapDays: number, rating: Rating): number {
  if (rating === 'free') return gapDays * 2;
  if (rating === 'cued') return gapDays;
  return 1;
}

// ponytail: the family hears only the good moment, never the lapse
export function familyMessage(storyTold: boolean, rating: Rating, memory: string): string {
  const opening = storyTold ? 'Σήμερα η Μαρία μού είπε την ιστορία του γάμου της' : 'Σήμερα μιλήσαμε με τη Μαρία';
  return rating === 'struggled' ? `${opening} 💛` : `${opening} και θυμήθηκε ${memory} 💛`;
}
