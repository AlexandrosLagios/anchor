import { Logger } from '@nestjs/common';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, expect, test, vi } from 'vitest';
import { speak } from '../model/model';
import { FakeTransport } from './fake-transport';
import { openStore } from './store';
import { tell, VOICE_STYLE } from './tell';
import { Blocked, type Context } from './types';

vi.mock('../model/model', async (importOriginal) => ({ ...(await importOriginal<typeof import('../model/model')>()), speak: vi.fn() }));

const wav = Buffer.from('RIFF clip');
beforeEach(() => {
  vi.mocked(speak).mockReset().mockResolvedValue(wav);
});

function setup() {
  const transport = new FakeTransport();
  const store = openStore(join(mkdtempSync(join(tmpdir(), 'anchor-tell-')), 'state.json'));
  const family = store.addFamily('-100', '-100');
  const member = store.joinMember(family, { id: '42', name: 'Nikos' });
  member.started = true;
  const ctx: Context = { now: () => 0, store, transport: () => transport };
  return { transport, store, family, member, ctx };
}

test('tell sends the message to the member through the family transport, and returns the send result', async () => {
  const { transport, family, member, ctx } = setup();
  const sent = await tell(family, member, { text: 'Hello' }, ctx);
  expect(sent).toEqual({ messageId: 'sent-1', voice: undefined });
  expect(transport.sent).toEqual([{ chatId: '42', messageId: 'sent-1', message: { text: 'Hello' } }]);
});

test('Blocked sets started to false, saves, and returns undefined', async () => {
  const { transport, store, family, member, ctx } = setup();
  vi.spyOn(transport, 'send').mockRejectedValue(new Blocked());
  const sent = await tell(family, member, { text: 'Hello' }, ctx);
  expect(sent).toBeUndefined();
  expect(member.started).toBe(false);
  expect(store.family('-100')?.members[0].started).toBe(false);
});

test('another error logs a warning and returns undefined, and started stays as it is', async () => {
  const { transport, family, member, ctx } = setup();
  vi.spyOn(transport, 'send').mockRejectedValue(new Error('network blip'));
  const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  const sent = await tell(family, member, { text: 'Hello' }, ctx);
  expect(sent).toBeUndefined();
  expect(member.started).toBe(true);
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('network blip'));
});

test('with the voice choice, a text line goes out as a voice note with the text as the caption and the same buttons', async () => {
  const { transport, family, member, ctx } = setup();
  member.choices.voice = true;
  const buttons = [{ label: 'My settings', data: 'nxt:settings' }];
  const sent = await tell(family, member, { text: 'All set 💛', buttons }, ctx);
  expect(speak).toHaveBeenCalledWith('All set 💛', VOICE_STYLE);
  expect(transport.sent).toEqual([{ chatId: '42', messageId: 'sent-1', message: { text: 'All set 💛', buttons, voice: { wav } } }]);
  expect(sent).toEqual({ messageId: 'sent-1', voice: { id: 'voice-sent-1', mimeType: 'audio/ogg' } });
});

test('without the voice choice, tell never speaks', async () => {
  const { transport, family, member, ctx } = setup();
  await tell(family, member, { text: 'All set 💛' }, ctx);
  expect(speak).not.toHaveBeenCalled();
  expect(transport.sent[0].message).toEqual({ text: 'All set 💛' });
});

test('with the voice choice, a line with a photo, a video, a voice note, an album, or a contact goes out as it is', async () => {
  const { transport, family, member, ctx } = setup();
  member.choices.voice = true;
  const messages = [
    { photo: { id: 'p1' }, text: 'Sofia shared: «Our trip»' },
    { video: { id: 'v1' }, text: 'Sofia shared: «Our trip»' },
    { voice: { id: 'voice-1' } },
    { album: [{ photo: { id: 'p1' } }, { photo: { id: 'p2' } }], text: 'Then and now' },
    { contact: { phone: '+15551234567', name: 'Anchor' } },
  ];
  for (const message of messages) await tell(family, member, message, ctx);
  expect(speak).not.toHaveBeenCalled();
  expect(transport.sent.map(({ message }) => message)).toEqual(messages);
});

test('a failed TTS call sends the text', async () => {
  const { transport, family, member, ctx } = setup();
  member.choices.voice = true;
  vi.mocked(speak).mockRejectedValue(new Error('TTS quota'));
  const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  const sent = await tell(family, member, { text: 'All set 💛' }, ctx);
  expect(sent).toEqual({ messageId: 'sent-1', voice: undefined });
  expect(transport.sent.map(({ message }) => message)).toEqual([{ text: 'All set 💛' }]);
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('TTS quota'));
});

test('a failed conversion or voice send sends the text', async () => {
  const { transport, family, member, ctx } = setup();
  member.choices.voice = true;
  const send = transport.send.bind(transport);
  vi.spyOn(transport, 'send').mockImplementation(async (chatId, message) => {
    if (message.voice) throw new Error('ffmpeg failed');
    return send(chatId, message);
  });
  vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  await tell(family, member, { text: 'All set 💛' }, ctx);
  expect(transport.sent.map(({ message }) => message)).toEqual([{ text: 'All set 💛' }]);
});

test('Blocked on the voice note sets started to false and sends no text', async () => {
  const { transport, family, member, ctx } = setup();
  member.choices.voice = true;
  const send = vi.spyOn(transport, 'send').mockRejectedValue(new Blocked());
  expect(await tell(family, member, { text: 'All set 💛' }, ctx)).toBeUndefined();
  expect(member.started).toBe(false);
  expect(send).toHaveBeenCalledTimes(1);
});
