import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { demoNow } from './core/clock';
import { FakeTransport } from './core/fake-transport';
import { lines } from './core/lines';
import { createRouter } from './core/router';
import { openStore } from './core/store';
import type { Context, Incoming, Person } from './core/types';
import { FEATURES, nextWindow } from './family.service';
import { bundles } from './features/capture/capture';
import { choiceButtons } from './features/members';
import * as model from './model/model';

vi.mock('./model/model', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./model/model')>()),
  ask: vi.fn(),
  transcribe: vi.fn(),
  speak: vi.fn(),
}));

const HOUR = 3_600_000;
const eleni: Person = { id: 'u-eleni', name: 'Eleni' };
const nikos: Person = { id: 'u-nikos', name: 'Nikos' };
const maria = "Maria's first day of school! She wore her new red backpack.";
const nikosFirstDay = 'My first day of school, 1958. My mother walked me to the gate.';
const nikosStory = 'My first day was in 1958. My mother walked me to the village school, and I cried at the gate.';
const pills = 'Dad, remember to take your pills with you when we leave in the morning.';
const wav = Buffer.from('RIFF clip');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 25, 12));
  bundles.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

function setup() {
  const store = openStore(join(mkdtempSync(join(tmpdir(), 'anchor-demo-')), 'state.json'), Date.now());
  const family = store.addFamily('-100', '-100');
  const transport = new FakeTransport();
  transport.admins.add(eleni.id);
  transport.files.set('photo-maria', { data: Buffer.from('maria jpeg'), mimeType: 'image/jpeg' });
  transport.files.set('photo-1958', { data: Buffer.from('1958 jpeg'), mimeType: 'image/jpeg' });
  transport.files.set('voice-nikos', { data: Buffer.from('nikos ogg'), mimeType: 'audio/ogg' });
  let restart = false;
  const ctx: Context = { now: () => demoNow(store.state, 86400), store, transport: () => transport, restartWindow: () => (restart = true) };
  const router = createRouter(FEATURES, ctx);
  let from = ctx.now();
  let id = 0;
  return {
    store,
    family,
    transport,
    ctx,
    say: (sender: Person, message: Partial<Incoming>) =>
      router.route({ familyId: '-100', chat: 'group', chatId: '-100', messageId: String(++id), sender, at: Date.now(), ...message }),
    whisper: (sender: Person, message: Partial<Incoming>) =>
      router.route({ chat: 'private', chatId: sender.id, messageId: String(++id), sender, at: Date.now(), ...message }),
    // the host's tick loop: each window runs from the previous one to now, and restartWindow empties the next one
    tick: async () => {
      const to = ctx.now();
      const window = nextWindow(from, to, restart);
      restart = false;
      await router.tick(window);
      from = to;
    },
  };
}

vi.mocked(model.ask).mockImplementation(async (prompt: string, schema: object) => {
  const properties = (schema as { properties: Record<string, unknown> }).properties;
  const momentId = (prompt.match(/- id (\S+): "Maria's first day at school"/) ?? prompt.match(/(\S+): "Maria's first day at school"/))?.[1];
  if (properties.verdict) {
    const isNikos = prompt.includes('1958');
    return {
      verdict: prompt.includes('pills') ? 'logistics' : 'family_moment',
      salience: 4,
      people: [isNikos ? 'Nikos' : 'Maria'],
      eventDate: '',
      title: isNikos ? "Nikos's first day at school" : "Maria's first day at school",
      transcript: '',
    };
  }
  if (properties.earlier) return { momentId, earlier: 'new' };
  // the intent prompt quotes the demo phrases as examples, so only the quoted message decides
  if (properties.intent) return prompt.includes(': "can you send me the family photos?"') ? { intent: 'sendMe', momentId: 'none' } : { intent: 'find', momentId };
  if (properties.kind) return { kind: 'story', transcript: nikosStory };
  if (properties.offer) return prompt.includes('pills') ? { offer: true, who: nikos.id, time: '08:00' } : { offer: false, who: 'unknown', time: '' };
  return { momentId };
});

vi.mocked(model.speak).mockResolvedValue(wav);

test('the v2 demo script: Nikos joins and chooses, a share offer, his voice story, and a private reminder', async () => {
  const { store, family, transport, say, whisper, tick } = setup();
  const eleniMember = store.joinMember(family, eleni);
  eleniMember.started = true;
  const toGroup = () => transport.sent.filter(({ chatId, message }) => chatId === '-100' && !message.onlyFor);

  // beat 1: only Nikos sees the nudge, and the group sees only his question
  await say(nikos, { text: 'Anchor, can you send me the family photos?' });
  const chooseButton = { label: lines.buttons.chooseForMe, url: transport.startLink('-100') };
  expect(transport.sent).toEqual([{ chatId: '-100', messageId: 'sent-1', message: { text: lines.nudge('Nikos'), buttons: [chooseButton], onlyFor: nikos.id } }]);

  // beat 2: Start, two choices that turn ✅ in place, and Done as a voice note
  await whisper(nikos, { text: '/start -100' });
  const member = family.members.find((person) => person.id === nikos.id);
  expect(member?.started).toBe(true);
  expect(transport.sent.at(-1)?.message.text).toBe(lines.welcome('Nikos'));
  const screen = transport.sent.at(-1)?.messageId ?? '';
  await whisper(nikos, { button: 'set:moments', messageId: screen });
  await whisper(nikos, { button: 'set:voice', messageId: screen });
  expect(transport.edits.map(({ messageId, change }) => [messageId, change])).toEqual([
    [screen, { buttons: expect.arrayContaining([{ label: `✅ ${lines.buttons.choices.moments}`, data: 'set:moments' }]) }],
    [screen, { buttons: member && choiceButtons(member) }],
  ]);
  await whisper(nikos, { button: 'set:done' });
  expect(transport.sent.at(-1)?.message).toMatchObject({
    text: lines.choicesSaved(['family moments', 'reminders', 'share offers', 'voice notes']),
    voice: { wav },
  });

  // beat 3: the photo gets ❤, and only Eleni sees the share offer
  await say(eleni, { text: maria, photo: { id: 'photo-maria' } });
  vi.setSystemTime(Date.now() + 2000);
  await tick();
  const [moment] = family.moments;
  expect(transport.reactions).toContainEqual({ chatId: '-100', messageId: moment.messageIds[0], emoji: '\u2764', big: undefined });
  const [offer] = family.offers;
  expect(transport.sent.at(-1)?.message).toMatchObject({ text: lines.shareOffer(['Nikos']), onlyFor: eleni.id });
  await say(eleni, { button: `shr:yes:${offer.id}`, messageId: offer.messageId, ephemeral: true });
  expect(transport.edits.at(-1)).toEqual({ chatId: '-100', messageId: offer.messageId, change: { text: lines.shareSent(['Nikos']), onlyFor: eleni.id } });

  // beat 4: the photo and the invitation voice note in private, his voice story, and the story in the group
  const inPrivate = transport.sent.filter(({ chatId }) => chatId === nikos.id).slice(-2).map(({ message }) => message);
  expect(inPrivate).toEqual([{ photo: { id: 'photo-maria' } }, expect.objectContaining({ voice: { wav }, text: lines.invitation(moment) })]);
  await whisper(nikos, { voice: { id: 'voice-nikos', mimeType: 'audio/ogg' } });
  expect(transport.sent.at(-1)?.message).toMatchObject({ text: lines.thanks, voice: { wav } });
  await whisper(nikos, { button: `inv:share:${moment.id}` });
  const story = toGroup().at(-2);
  expect(story?.message).toMatchObject({ text: lines.storyAdded('Nikos', 'Eleni', nikosStory), mention: eleni });
  expect(transport.reactions).toContainEqual({ chatId: '-100', messageId: story?.messageId, emoji: '\u2764', big: true });
  expect(toGroup().at(-1)?.message).toEqual({ voice: { id: 'voice-nikos', mimeType: 'audio/ogg' } });
  expect(transport.sent.at(-1)?.message).toMatchObject({ text: lines.shared, voice: { wav } });

  // beat 5: only Nikos sees the reminder offer, and the family sees only the ✍
  const seenByGroup = toGroup().length;
  await say(eleni, { text: pills, replyTo: '1', replyToSender: nikos });
  const [reminderOffer] = family.offers;
  expect(transport.sent.at(-1)?.message).toMatchObject({ text: lines.reminderOffer('Eleni', pills), onlyFor: nikos.id });
  await say(nikos, { button: `rem:${reminderOffer.id}:08:00`, messageId: reminderOffer.messageId, ephemeral: true });
  expect(transport.edits.at(-1)?.change).toEqual({ text: lines.reminderSet('08:00'), onlyFor: nikos.id });
  expect(transport.reactions.at(-1)).toMatchObject({ emoji: '✍' });
  vi.setSystemTime(Date.now() + 2000);
  await tick();
  expect(family.moments).toHaveLength(1);

  // beat 6: only Eleni sees the jump, and Nikos gets his reminder in private as a voice note
  await say(eleni, { text: '/fastforward 08:05', ephemeral: true });
  expect(transport.sent.at(-1)?.message).toMatchObject({ text: expect.stringContaining('08:05'), onlyFor: eleni.id });
  await tick();
  expect(transport.sent.at(-1)).toMatchObject({ chatId: nikos.id, message: { text: lines.reminder('Eleni', pills), voice: { wav } } });
  expect(toGroup()).toHaveLength(seenByGroup);
});

test('v1 cues still work: then and now, a question, and the 18:00 post one week later', async () => {
  const { store, family, transport, say, tick } = setup();

  await say(eleni, { text: maria, photo: { id: 'photo-maria' } });
  vi.setSystemTime(Date.now() + 2000);
  await tick();
  const [first] = family.moments;
  expect(first).toMatchObject({ by: eleni, text: maria, title: "Maria's first day at school", photo: { id: 'photo-maria' } });

  await say(eleni, { text: '/fastforward 3' });
  expect(transport.sent.at(-1)?.message.text).toBe(lines.fastforwarded('28 September 2026 at 12:00'));
  await tick();

  await say(nikos, { text: nikosFirstDay, photo: { id: 'photo-1958' } });
  vi.setSystemTime(Date.now() + 2000);
  await tick();
  const second = family.moments[1];
  expect(second.echo).toBe(first.id);
  expect(transport.sent.at(-1)?.message).toEqual({
    album: [{ photo: { id: 'photo-1958' } }, { photo: { id: 'photo-maria' } }],
    text: lines.echoCaption(second, first),
  });

  await say(nikos, { text: 'Anchor, when did Maria start school?' });
  expect(transport.sent.at(-1)?.message).toEqual({
    photo: { id: 'photo-maria' },
    text: lines.askAnswer("Maria's first day at school", '25 September 2026', []),
    replyTo: '4',
  });

  await say(eleni, { text: '/fastforward 4' });
  const beforeSlot = transport.sent.length;
  await tick();
  expect(transport.sent).toHaveLength(beforeSlot);

  vi.setSystemTime(Date.now() + 6 * HOUR + 60_000);
  await tick();
  expect(transport.sent.at(-1)?.message).toEqual({ photo: { id: 'photo-maria' }, text: lines.memoryCaption(lines.labels['7'], first) });
  expect(store.state.clockOffset).toBe(7 * 24 * HOUR);
});

test('on cue: /fastforward 7 then /memory posts one week ago at once, before the next 18:00', async () => {
  const { family, transport, say, tick } = setup();
  await say(eleni, { text: maria, photo: { id: 'photo-maria' } });
  vi.setSystemTime(Date.now() + 2000);
  await tick();

  await say(eleni, { text: '/fastforward 7' });
  const afterJump = transport.sent.length;
  await tick();
  expect(transport.sent).toHaveLength(afterJump);

  await say(eleni, { text: '/memory' });
  const label = lines.labels['7'];
  expect(transport.sent.at(-1)?.message).toEqual({ photo: { id: 'photo-maria' }, text: lines.memoryCaption(label, family.moments[0]) });
});
