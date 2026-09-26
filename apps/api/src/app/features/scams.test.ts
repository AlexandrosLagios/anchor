import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, expect, test, vi } from 'vitest';
import { FakeTransport } from '../core/fake-transport';
import { lines } from '../core/lines';
import { openStore } from '../core/store';
import { Blocked, type Choices, type Context, type Family, type Incoming } from '../core/types';
import * as model from '../model/model';
import { scams } from './scams';

vi.mock('../model/model', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../model/model')>()),
  ask: vi.fn(),
}));

const CHOICES: Choices = { moments: false, reminders: true, shares: true, voice: false, call: false };
const NOW = new Date(2026, 8, 26, 12).getTime();
const SCAM = 'Mum, it is Eleni, my phone broke. Please send 800 euros to this account today, it is urgent';

let transport: FakeTransport;
let ctx: Context;
let family: Family;

beforeEach(() => {
  vi.mocked(model.ask).mockReset();
  transport = new FakeTransport();
  const store = openStore(join(mkdtempSync(join(tmpdir(), 'anchor-scams-')), 'state.json'), NOW);
  ctx = { now: () => NOW, store, transport: () => transport };
  family = store.addFamily('-100', '-100');
  family.members.push(
    { id: '1', name: 'Sofia', started: true, choices: { ...CHOICES } },
    { id: '2', name: 'Eleni', started: true, choices: { ...CHOICES } },
    { id: '3', name: 'Nikos', started: false, choices: { ...CHOICES } },
  );
});

const fromSofia = (overrides: Partial<Incoming>): Incoming => ({
  chat: 'private',
  chatId: '1',
  messageId: 'p1',
  sender: { id: '1', name: 'Sofia' },
  at: NOW,
  ...overrides,
});
const forwarded = (overrides: Partial<Incoming> = {}) => fromSofia({ text: SCAM, forwarded: true, forwardedFrom: '555', ...overrides });
const answer = (asks: boolean, claims: string) => vi.mocked(model.ask).mockResolvedValue({ asks, claims });
const sent = () => transport.sent.map(({ chatId, message }) => ({ chatId, ...message }));

test('a forwarded money request from another account that claims to be Eleni gets the warning and the "Tell Eleni" button', async () => {
  answer(true, '2');
  expect(await scams.handle?.(forwarded(), family, ctx)).toBe(true);
  expect(sent()).toEqual([{ chatId: '1', text: lines.scam.warning('Eleni'), buttons: [{ label: lines.buttons.tellMember('Eleni'), data: 'scm:2' }] }]);
  expect(lines.scam.warning('Eleni')).toContain("did not come from Eleni's Telegram account");
});

test('the same message forwarded from the own account of Eleni gets no warning', async () => {
  answer(true, '2');
  await scams.handle?.(forwarded({ forwardedFrom: '2' }), family, ctx);
  expect(sent()).toEqual([{ chatId: '1', text: lines.scam.fromAccount('Eleni') }]);
});

test('a hidden forward origin gets the warning that Anchor cannot see the account', async () => {
  answer(true, '2');
  await scams.handle?.(forwarded({ forwardedFrom: undefined }), family, ctx);
  expect(sent()[0].text).toBe(lines.scam.warning('Eleni', true));
  expect(sent()[0].text).toContain("I can't see that this message came from Eleni's Telegram account");
});

test('a forwarded message without a request gets the neutral answer', async () => {
  answer(false, '2');
  await scams.handle?.(forwarded({ text: 'Mum, can you send me the photos from yesterday?' }), family, ctx);
  expect(sent()).toEqual([{ chatId: '1', text: lines.scam.neutral }]);
});

test('a forward without words gets the neutral answer without a model call, and a forwarded album gets one answer', async () => {
  await scams.handle?.(forwarded({ text: undefined, voice: { id: 'v1' } }), family, ctx);
  answer(true, '2');
  await scams.handle?.(forwarded({ photo: { id: 'a1' }, albumId: 'album-1' }), family, ctx);
  expect(await scams.handle?.(forwarded({ text: undefined, photo: { id: 'a2' }, albumId: 'album-1' }), family, ctx)).toBe(true);
  expect(sent().map((message) => message.text)).toEqual([lines.scam.neutral, lines.scam.warning('Eleni')]);
  expect(model.ask).toHaveBeenCalledTimes(1);
});

test('a failed model call gets the neutral answer and never a warning', async () => {
  vi.mocked(model.ask).mockRejectedValue(new Error('timeout'));
  await scams.handle?.(forwarded(), family, ctx);
  expect(sent()).toEqual([{ chatId: '1', text: lines.scam.neutral }]);
});

test('a request that claims no family member, or a member who never started, gets the warning without a button', async () => {
  answer(true, 'none');
  await scams.handle?.(forwarded(), family, ctx);
  answer(true, '3');
  await scams.handle?.(forwarded(), family, ctx);
  expect(sent()).toEqual([
    { chatId: '1', text: lines.scam.warning(undefined) },
    { chatId: '1', text: lines.scam.warning('Nikos') },
  ]);
});

test('the fast model sees the forwarded words and the other members, never the forwarder', async () => {
  answer(false, 'none');
  await scams.handle?.(forwarded(), family, ctx);
  const [prompt, schema, options] = vi.mocked(model.ask).mock.calls[0];
  expect(prompt).toContain(SCAM);
  expect(prompt).toContain('id 2: Eleni');
  expect(prompt).not.toContain('Sofia');
  expect(JSON.stringify(schema)).toContain('["2","3","none"]');
  expect(options).toMatchObject({ fast: true });
});

test('a "Tell Eleni" tap sends Eleni a private note that the name of Eleni was used in a message to Sofia', async () => {
  expect(await scams.handle?.(fromSofia({ button: 'scm:2', messageId: 'w1' }), family, ctx)).toBe(true);
  expect(transport.edits).toEqual([{ chatId: '1', messageId: 'w1', change: { buttons: [] } }]);
  expect(sent()).toEqual([
    { chatId: '2', text: lines.scam.nameUsed('Sofia') },
    { chatId: '1', text: lines.scam.told('Eleni') },
  ]);
});

test('a "Tell Eleni" tap that cannot reach Eleni tells Sofia to call', async () => {
  const send = transport.send.bind(transport);
  vi.spyOn(transport, 'send').mockImplementation(async (chatId, message) => {
    if (chatId === '2') throw new Blocked('blocked');
    return send(chatId, message);
  });
  await scams.handle?.(fromSofia({ button: 'scm:2' }), family, ctx);
  expect(sent()).toEqual([{ chatId: '1', text: lines.scam.notTold('Eleni') }]);
});

test('a tap that names no other member of the family sends nothing', async () => {
  expect(await scams.handle?.(fromSofia({ button: 'scm:1' }), family, ctx)).toBe(true);
  expect(await scams.handle?.(fromSofia({ button: 'scm:9' }), family, ctx)).toBe(true);
  expect(sent()).toEqual([]);
});

test('a message that is not forwarded, a forward in the group, and a forward from a stranger pass through', async () => {
  expect(await scams.handle?.(fromSofia({ text: 'Send me a moment' }), family, ctx)).toBe(false);
  expect(await scams.handle?.(forwarded({ chat: 'group', chatId: '-100', familyId: '-100' }), family, ctx)).toBe(false);
  expect(await scams.handle?.(forwarded({ sender: { id: '9', name: 'Stranger' } }), family, ctx)).toBe(false);
  expect(await scams.handle?.(forwarded(), undefined, ctx)).toBe(false);
  expect(model.ask).not.toHaveBeenCalled();
});
