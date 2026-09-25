process.env.TZ = 'Europe/Athens';

import { expect, test } from 'vitest';
import { byPriority, isAnniversary } from './priority';
import type { Moment } from './types';

const now = new Date(2026, 8, 25, 0, 30).getTime();

const moment = (id: string, fields: Partial<Moment>): Moment => ({
  id,
  by: { id: '1', name: 'Sofia' },
  messageIds: [],
  savedAt: 0,
  text: 'Maria on her first day at school',
  salience: 3,
  sensitive: false,
  people: [],
  title: "Maria's first day at school",
  stories: [],
  lookbacks: [],
  memoryPostIds: [],
  returns: {},
  ...fields,
});

test('isAnniversary matches the local month and day of an earlier year', () => {
  expect(isAnniversary('2019-09-25', now)).toBe(true);
  expect(isAnniversary('2026-09-25', now)).toBe(false);
  expect(isAnniversary('2030-09-25', now)).toBe(false);
  expect(isAnniversary('2019-09-24', now)).toBe(false);
  expect(isAnniversary('2019-10-25', now)).toBe(false);
  expect(isAnniversary(undefined, now)).toBe(false);
  expect(isAnniversary('25/09/2019', now)).toBe(false);
});

test('byPriority puts the anniversary first, then the higher salience, then the older moment', () => {
  const moments = [
    moment('low', { salience: 2, savedAt: 1 }),
    moment('newer', { salience: 5, savedAt: 9 }),
    moment('older', { salience: 5, savedAt: 3 }),
    moment('anniversary', { salience: 1, savedAt: 8, eventDate: '2001-09-25' }),
  ];
  expect(moments.sort(byPriority(now)).map((item) => item.id)).toEqual(['anniversary', 'older', 'newer', 'low']);
});
