import { expect, test } from 'vitest';
import { familyMessage, nextGap, rate } from './protocol';

test('rate', () => {
  expect(rate(1, 1, false)).toBe('free');
  expect(rate(1, 1, true)).toBe('cued');
  expect(rate(0, 1, true)).toBe('struggled');
  expect(rate(2, 4, false)).toBe('struggled');
});

test('nextGap doubles on free recall, holds on a hint, resets on a struggle', () => {
  expect(nextGap(2, 'free')).toBe(4);
  expect(nextGap(2, 'cued')).toBe(2);
  expect(nextGap(8, 'struggled')).toBe(1);
});

test('familyMessage never reports a lapse', () => {
  expect(familyMessage(true, 'free', 'τον γάμο της Άννας')).toBe(
    'Σήμερα η Μαρία μού είπε την ιστορία του γάμου της και θυμήθηκε τον γάμο της Άννας 💛',
  );
  expect(familyMessage(false, 'struggled', 'τον γάμο της Άννας')).toBe('Σήμερα μιλήσαμε με τη Μαρία 💛');
});
