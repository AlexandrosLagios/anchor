process.env.TZ = 'Europe/Athens';

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { FakeTransport } from '../../core/fake-transport';
import { lines } from '../../core/lines';
import { openStore } from '../../core/store';
import type { Context } from '../../core/types';
import { birthdayDue, birthdaysThisMonth } from './birthdays';

const NOW = new Date(2026, 8, 25, 12).getTime();
const ELENI = { id: '7', name: 'Eleni' };

function setup() {
  const store = openStore(join(mkdtempSync(join(tmpdir(), 'anchor-birthdays-')), 'state.json'), NOW);
  const family = store.addFamily('-100', '-100');
  const member = store.joinMember(family, { id: '42', name: 'Nikos' });
  member.started = true;
  const transport = new FakeTransport();
  const ctx: Context = { now: () => NOW, store, transport: () => transport };
  return { family, member, transport, ctx };
}

test('a birthday is due at 09:00 on its next day, and a day that passed moves to next year', () => {
  expect(birthdayDue(NOW, '10-03')).toBe(new Date(2026, 9, 3, 9).getTime());
  expect(birthdayDue(NOW, '09-26')).toBe(new Date(2026, 8, 26, 9).getTime());
  expect(birthdayDue(NOW, '09-25')).toBe(new Date(2027, 8, 25, 9).getTime());
});

test("this month's birthdays come as a list, and each one still to come gets one reminder at 09:00", async () => {
  const { family, member, transport, ctx } = setup();
  member.choices.reminders = false;
  family.birthdays = [
    { name: 'Maria', date: '09-30', from: ELENI },
    { name: 'Eleni', date: '10-02', from: ELENI },
    { name: 'Dimitris', date: '09-10', from: ELENI },
  ];

  await birthdaysThisMonth(family, member, 'p1', ctx);
  await birthdaysThisMonth(family, member, 'p2', ctx);

  expect(transport.sent[0].message.text).toBe(lines.birthdaysThisMonth(['Dimitris, 10 September', 'Maria, 30 September'], true));
  expect(family.reminders).toEqual([
    expect.objectContaining({ to: '42', birthday: 'Maria', status: 'set', due: new Date(2026, 8, 30, 9).getTime(), text: "Maria's birthday" }),
  ]);
  expect(member.choices.reminders).toBe(true);
});

test('with no birthday this month, the answer names the next one', async () => {
  const { family, member, transport, ctx } = setup();
  await birthdaysThisMonth(family, member, 'p1', ctx);
  family.birthdays = [{ name: 'Eleni', date: '10-02', from: ELENI }];
  await birthdaysThisMonth(family, member, 'p1', ctx);

  expect(transport.sent.map((sent) => sent.message.text)).toEqual([lines.noBirthdays(), lines.noBirthdays('Eleni, 2 October')]);
  expect(family.reminders).toEqual([]);
});
