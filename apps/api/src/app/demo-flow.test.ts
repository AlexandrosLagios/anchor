import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { demoNow } from './core/clock';
import { FakeTransport } from './core/fake-transport';
import { lines } from './core/lines';
import { createRouter } from './core/router';
import { openStore } from './core/store';
import type { Incoming, Person } from './core/types';
import { FEATURES } from './family.service';
import { bundles } from './features/capture/capture';
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
  const ctx = { now: () => demoNow(store.state, 86400), store, transport: () => transport };
  const router = createRouter(FEATURES, ctx);
  let from = ctx.now();
  let id = 0;
  return {
    store,
    family,
    transport,
    say: (sender: Person, message: Partial<Incoming>) =>
      router.route({ familyId: '-100', chat: 'group', chatId: '-100', messageId: String(++id), sender, at: Date.now(), ...message }),
    // the host's tick loop: each window runs from the previous one to now
    tick: async () => {
      const to = ctx.now();
      await router.tick({ from, to });
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
      verdict: 'family_moment',
      salience: 4,
      people: [isNikos ? 'Nikos' : 'Maria'],
      eventDate: '',
      title: isNikos ? "Nikos's first day at school" : "Maria's first day at school",
      transcript: '',
    };
  }
  if (properties.earlier) return { momentId, earlier: 'new' };
  return { momentId };
});

test('the demo script: then and now, a question, and the 18:00 post one week later', async () => {
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
