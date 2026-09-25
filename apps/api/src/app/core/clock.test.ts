process.env.TZ = 'Europe/Athens';

import { expect, test } from 'vitest';
import { dayIndex, demoNow, slotIn } from './clock';

const at = (day: number, hour: number, minute = 0) => new Date(2026, 8, day, hour, minute).getTime();

test('demoNow runs one demo day per ANCHOR_DAY_SECONDS real seconds', () => {
  const state = { clockStart: 1_000_000, clockOffset: 0 };
  expect(demoNow(state, 120, 1_000_000 + 60_000)).toBe(1_000_000 + 43_200_000);
  expect(demoNow(state, 86400, 1_000_000 + 60_000)).toBe(1_000_000 + 60_000);
});

test('demoNow adds the fast-forward offset', () => {
  const week = 7 * 86_400_000;
  expect(demoNow({ clockStart: 1_000_000, clockOffset: week }, 120, 1_000_000 + 60_000)).toBe(1_000_000 + 43_200_000 + week);
});

test('dayIndex counts local days', () => {
  expect(dayIndex(at(25, 0, 30))).toBe(dayIndex(at(25, 23, 59)));
  expect(dayIndex(at(26, 0, 0))).toBe(dayIndex(at(25, 23, 59)) + 1);
});

test('slotIn returns the local hour inside the window, excluding the start', () => {
  expect(slotIn({ from: at(25, 10, 59), to: at(25, 11, 1) }, 11)).toBe(at(25, 11));
  expect(slotIn({ from: at(25, 10, 58), to: at(25, 11) }, 11)).toBe(at(25, 11));
  expect(slotIn({ from: at(25, 11), to: at(25, 11, 2) }, 11)).toBeUndefined();
  expect(slotIn({ from: at(25, 9), to: at(25, 10, 59) }, 11)).toBeUndefined();
  expect(slotIn({ from: at(25, 23), to: at(26, 1) }, 11)).toBeUndefined();
});

test('slotIn returns the latest slot of a window longer than a day', () => {
  expect(slotIn({ from: at(24, 12), to: at(26, 12) }, 11)).toBe(at(26, 11));
});

test('slotIn keeps local time across the end of summer time', () => {
  const dstEnd = new Date(2026, 9, 25, 11).getTime();
  expect(slotIn({ from: new Date(2026, 9, 24, 12).getTime(), to: new Date(2026, 9, 25, 12).getTime() }, 11)).toBe(dstEnd);
});
