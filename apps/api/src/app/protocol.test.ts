import { expect, test } from 'vitest';
import { familyNote, nextGap, rate, scheduleNext } from './protocol';

test('rate', () => {
  expect(rate(1, 1, false)).toBe('free');
  expect(rate(1, 1, true)).toBe('cued');
  expect(rate(0, 1, true)).toBe('struggled');
  expect(rate(2, 4, false)).toBe('struggled');
});

test('nextGap doubles on free recall, holds on a cue, resets on a struggle', () => {
  expect(nextGap(2, 'free')).toBe(4);
  expect(nextGap(2, 'cued')).toBe(2);
  expect(nextGap(8, 'struggled')).toBe(1);
});

test('familyNote never reports a lapse', () => {
  expect(familyNote('free', "Maria's first day of school")).toBe(
    "Athina remembered Maria's first day of school today 💛",
  );
  expect(familyNote('cued', "Maria's first day of school")).toBe(
    "Athina remembered Maria's first day of school today 💛",
  );
  expect(familyNote('struggled', "Maria's first day of school")).toBeUndefined();
});

test('scheduleNext lands at 11:00 local', () => {
  const from = new Date('2026-09-25T15:30:00');
  const next = new Date(scheduleNext(2, from));
  expect(next.getDate()).toBe(27);
  expect(next.getHours()).toBe(11);
});
