import { spawnSync } from 'node:child_process';
import { beforeEach, expect, test, vi } from 'vitest';
import { Blocked } from '../core/types';
import { httpFetch, type HttpResponse } from '../http';
import { wav } from '../song';
import { TelegramTransport, toIncoming, type Update } from './telegram';

vi.mock('../http', () => ({ httpFetch: vi.fn() }));
const fetchMock = vi.mocked(httpFetch);
beforeEach(() => {
  fetchMock.mockReset();
});

const BOT = 'anchor_test_bot';
const anchorBot = { id: 999, is_bot: true, first_name: 'Anchor', username: BOT };
const sofia = { id: 111, is_bot: false, first_name: 'Sofia', last_name: 'Pappas', username: 'sofia_p', language_code: 'en' };
const nikos = { id: 222, is_bot: false, first_name: 'Nikos', language_code: 'el' };
const group = { id: -1001234567890, title: 'The Pappas family', type: 'supergroup' as const };
const privateChat = { id: 222, first_name: 'Nikos', type: 'private' as const };
const date = 1790340000;

const message = (fields: object, update_id = 1): Update => ({
  update_id,
  message: { message_id: 42, from: sofia, chat: group, date, ...fields },
});
const button = (chat: typeof group | typeof privateChat, update_id = 1) => ({
  update_id,
  callback_query: {
    id: `q${update_id}`,
    from: nikos,
    message: { message_id: 50, from: anchorBot, chat, date, text: 'Sofia shared: «First day»' },
    chat_instance: '-5555',
    data: 'not-now',
  },
});
const membership = (chat: typeof group | typeof privateChat, from: string, to: string) => ({
  update_id: 1,
  my_chat_member: {
    chat,
    from: sofia,
    date,
    old_chat_member: { status: from, user: anchorBot },
    new_chat_member: { status: to, user: anchorBot },
  },
});
const file = (file_id: string) => ({ file_id, file_unique_id: `${file_id}-unique`, file_size: 5000 });

test('toIncoming maps a group text message', () => {
  expect(toIncoming(message({ text: 'Maria on her first day at school' }), BOT)).toEqual({
    familyId: '-1001234567890',
    chat: 'group',
    chatId: '-1001234567890',
    messageId: '42',
    sender: { id: '111', name: 'Sofia' },
    at: date * 1000,
    text: 'Maria on her first day at school',
    forwarded: false,
    unsupported: false,
  });
});

test('toIncoming keeps the largest photo size and the caption as text', () => {
  const photo = [
    { ...file('small'), width: 90, height: 67 },
    { ...file('large'), width: 1280, height: 960 },
    { ...file('medium'), width: 320, height: 240 },
  ];
  expect(toIncoming(message({ photo, caption: 'First day!' }), BOT)).toMatchObject({
    photo: { id: 'large', mimeType: 'image/jpeg' },
    text: 'First day!',
    unsupported: false,
  });
});

test('toIncoming maps a voice note', () => {
  const event = toIncoming(message({ voice: { ...file('voice-1'), duration: 4, mime_type: 'audio/ogg' } }), BOT);
  expect(event).toMatchObject({ voice: { id: 'voice-1', mimeType: 'audio/ogg' }, unsupported: false });
  expect(event?.text).toBeUndefined();
});

test('toIncoming maps a reply with the sender of the replied-to message', () => {
  const reply_to_message = { message_id: 40, from: nikos, chat: group, date, text: 'Look at her!' };
  expect(toIncoming(message({ text: 'She was so proud', reply_to_message }), BOT)).toMatchObject({
    replyTo: '40',
    replyToSender: { id: '222', name: 'Nikos' },
  });
});

test('toIncoming flags a forwarded message', () => {
  const forward_origin = { type: 'user', sender_user: nikos, date };
  expect(toIncoming(message({ text: 'Look at this', forward_origin }), BOT)?.forwarded).toBe(true);
});

test('toIncoming maps a video with its thumbnail', () => {
  const video = { ...file('video-1'), width: 1280, height: 720, duration: 30, mime_type: 'video/mp4', thumbnail: { ...file('thumb-1'), width: 320, height: 180 } };
  expect(toIncoming(message({ video, caption: 'Our trip to Nafplio' }), BOT)).toMatchObject({
    video: { id: 'video-1', mimeType: 'video/mp4' },
    thumbnail: { id: 'thumb-1', mimeType: 'image/jpeg' },
    text: 'Our trip to Nafplio',
    unsupported: false,
  });
});

test('toIncoming maps a video without a thumbnail', () => {
  const event = toIncoming(message({ video: { ...file('video-2'), width: 1280, height: 720, duration: 3, mime_type: 'video/mp4' } }), BOT);
  expect(event).toMatchObject({ video: { id: 'video-2', mimeType: 'video/mp4' }, unsupported: false });
  expect(event?.thumbnail).toBeUndefined();
});

test('toIncoming flags stickers, GIFs, video notes, documents, polls, and service messages as unsupported', () => {
  const kinds = [
    { sticker: { ...file('sticker'), width: 512, height: 512, is_animated: false, is_video: false, type: 'regular', emoji: '😀' } },
    { animation: { ...file('gif'), width: 320, height: 240, duration: 2 }, document: file('gif'), caption: 'lol' },
    { video_note: { ...file('round'), length: 240, duration: 5, thumbnail: { ...file('round-thumb'), width: 240, height: 240 } } },
    { document: { ...file('menu'), file_name: 'menu.pdf', mime_type: 'application/pdf' }, caption: 'The menu' },
    { poll: { id: 'p', question: 'Dinner?', options: [], total_voter_count: 0, is_closed: false, is_anonymous: true, type: 'regular', allows_multiple_answers: false } },
    { new_chat_members: [nikos] },
  ];
  expect(kinds.map((fields) => toIncoming(message(fields), BOT)?.unsupported)).toEqual([true, true, true, true, true, true]);
});

test('toIncoming maps a private message without a family', () => {
  expect(toIncoming(message({ chat: privateChat, from: nikos, text: 'hello' }), BOT)).toMatchObject({
    familyId: undefined,
    chat: 'private',
    chatId: '222',
    sender: { id: '222', name: 'Nikos' },
    text: 'hello',
  });
});

test('toIncoming maps a pressed button in private and in a group', () => {
  expect(toIncoming(button(privateChat), BOT)).toEqual({
    familyId: undefined,
    chat: 'private',
    chatId: '222',
    messageId: '50',
    sender: { id: '222', name: 'Nikos' },
    at: expect.any(Number),
    button: 'not-now',
  });
  expect(toIncoming(button(group), BOT)).toMatchObject({ familyId: '-1001234567890', chat: 'group', button: 'not-now' });
});

test('toIncoming maps Anchor joining a group', () => {
  expect(toIncoming(membership(group, 'left', 'member'), BOT)).toEqual({
    familyId: '-1001234567890',
    chat: 'group',
    chatId: '-1001234567890',
    messageId: '',
    sender: { id: '111', name: 'Sofia' },
    at: date * 1000,
    joined: true,
  });
  expect(toIncoming(membership(group, 'kicked', 'administrator'), BOT)?.joined).toBe(true);
});

test('toIncoming ignores a promotion, a removal, and a private block', () => {
  expect(toIncoming(membership(group, 'member', 'administrator'), BOT)).toBeUndefined();
  expect(toIncoming(membership(group, 'member', 'left'), BOT)).toBeUndefined();
  expect(toIncoming(membership(privateChat, 'member', 'kicked'), BOT)).toBeUndefined();
});

test('toIncoming strips a command suffix that names this bot', () => {
  expect(toIncoming(message({ text: '/memory@anchor_test_bot' }), BOT)?.text).toBe('/memory');
  expect(toIncoming(message({ text: '/start@Anchor_Test_Bot -1001234567890' }), BOT)?.text).toBe('/start -1001234567890');
});

test('toIncoming keeps a command that names another bot', () => {
  expect(toIncoming(message({ text: '/memory@other_bot' }), BOT)?.text).toBe('/memory@other_bot');
});

test('toIncoming ignores an edited message', () => {
  expect(toIncoming({ update_id: 1, edited_message: { message_id: 42, chat: group, date, text: 'typo' } } as Update, BOT)).toBeUndefined();
});

const ok = (result: unknown): HttpResponse => ({
  ok: true,
  status: 200,
  json: async () => ({ ok: true, result }),
  text: async () => '',
  arrayBuffer: async () => new Uint8Array(Buffer.from('voice bytes')).buffer,
});
const failed = (error_code: number, description: string): HttpResponse => ({
  ...ok(undefined),
  ok: false,
  status: error_code,
  json: async () => ({ ok: false, error_code, description }),
});
const sentMessage = (fields: object = {}) => ({ message_id: 77, from: anchorBot, chat: group, date, ...fields });

type BotCall = { url: string; method: string; params: Record<string, unknown> };
function botApi(answer: (method: string) => HttpResponse = () => ok(sentMessage())) {
  const calls: BotCall[] = [];
  fetchMock.mockImplementation(async (url, init) => {
    const method = url.slice(url.lastIndexOf('/') + 1);
    const body = init?.body;
    const params = body instanceof FormData ? Object.fromEntries(body) : JSON.parse(String(body ?? '{}'));
    calls.push({ url, method, params });
    return method === 'getMe' ? ok(anchorBot) : answer(method);
  });
  return calls;
}

test('poll advances the offset past each update, also when routing fails, and answers every button press', async () => {
  const stop = new AbortController();
  let polls = 0;
  const calls = botApi((method) => {
    if (method !== 'getUpdates') return ok(true);
    polls += 1;
    if (polls === 1) return ok([message({ chat: privateChat, from: nikos, text: 'hello' }, 7), button(privateChat, 8)]);
    stop.abort();
    return ok([]);
  });
  const telegram = await TelegramTransport.connect('TOKEN');
  const routed: string[] = [];
  await telegram.poll(async (event) => {
    routed.push(event.messageId);
    if (routed.length === 1) throw new Error('a feature failed');
  }, stop.signal);

  expect(calls.filter(({ method }) => method === 'getUpdates').map(({ params }) => params.offset)).toEqual([undefined, 9]);
  expect(routed).toEqual(['42', '50']);
  expect(calls.filter(({ method }) => method === 'answerCallbackQuery').map(({ params }) => params.callback_query_id)).toEqual(['q8']);
});

test('send posts a photo with a caption clipped to 1024 characters, the reply, and the buttons', async () => {
  const calls = botApi();
  const telegram = await TelegramTransport.connect('TOKEN');
  const sent = await telegram.send('-1001234567890', {
    photo: { id: 'large' },
    text: 'x'.repeat(1100),
    replyTo: '42',
    buttons: [
      { label: 'Not now', data: 'not-now' },
      { label: 'Start', url: `https://t.me/${BOT}?start=-1001234567890` },
    ],
  });
  expect(sent).toEqual({ messageId: '77', voice: undefined });
  expect(calls.at(-1)).toEqual({
    url: 'https://api.telegram.org/botTOKEN/sendPhoto',
    method: 'sendPhoto',
    params: {
      chat_id: '-1001234567890',
      photo: 'large',
      caption: 'x'.repeat(1024),
      reply_parameters: { message_id: 42, allow_sending_without_reply: true },
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'Not now', callback_data: 'not-now' },
            { text: 'Start', url: `https://t.me/${BOT}?start=-1001234567890` },
          ],
        ],
      },
    },
  });
});

test('send posts a video by its file id with the caption', async () => {
  const calls = botApi();
  const telegram = await TelegramTransport.connect('TOKEN');
  await telegram.send('222', { video: { id: 'video-1', mimeType: 'video/mp4' }, text: 'Sofia shared: «Our trip»' });
  expect(calls.at(-1)).toMatchObject({ method: 'sendVideo', params: { chat_id: '222', video: 'video-1', caption: 'Sofia shared: «Our trip»' } });
});

test('send posts text with sendMessage', async () => {
  const calls = botApi();
  const telegram = await TelegramTransport.connect('TOKEN');
  await telegram.send('222', { text: 'Hi! I keep your family record.' });
  expect(calls.at(-1)).toMatchObject({ method: 'sendMessage', params: { chat_id: '222', text: 'Hi! I keep your family record.' } });
});

test.skipIf(Boolean(spawnSync('ffmpeg', ['-version']).error))(
  'send uploads a WAV voice note as OGG and returns the new file id',
  async () => {
    const calls = botApi(() => ok(sentMessage({ voice: { ...file('new-voice'), duration: 1, mime_type: 'audio/ogg' } })));
    const telegram = await TelegramTransport.connect('TOKEN');
    const sent = await telegram.send('222', { voice: { wav: wav(Buffer.alloc(24000 * 2), 24000) }, text: 'Sofia shared: «First day»' });
    expect(sent).toEqual({ messageId: '77', voice: { id: 'new-voice', mimeType: 'audio/ogg' } });
    const { method, params } = calls.at(-1) as BotCall;
    expect(method).toBe('sendVoice');
    expect(params.chat_id).toBe('222');
    expect(params.caption).toBe('Sofia shared: «First day»');
    const voice = params.voice as File;
    expect(voice.name).toBe('voice.ogg');
    expect(Buffer.from(await voice.arrayBuffer()).subarray(0, 4).toString()).toBe('OggS');
  },
);

test('send throws Blocked when the person blocked Anchor', async () => {
  botApi(() => failed(403, 'Forbidden: bot was blocked by the user'));
  const telegram = await TelegramTransport.connect('TOKEN');
  await expect(telegram.send('222', { text: 'hello' })).rejects.toBeInstanceOf(Blocked);
});

test('react sets ❤ without the emoji variation selector', async () => {
  const calls = botApi(() => ok(true));
  const telegram = await TelegramTransport.connect('TOKEN');
  await telegram.react('-1001234567890', '42', '❤️');
  expect(calls.at(-1)).toMatchObject({
    method: 'setMessageReaction',
    params: { chat_id: '-1001234567890', message_id: 42, reaction: [{ type: 'emoji', emoji: '❤' }] },
  });
});

test('download fetches the file by the path that getFile returns', async () => {
  const calls = botApi(() => ok({ ...file('voice-1'), file_path: 'voice/file_3.oga' }));
  const telegram = await TelegramTransport.connect('TOKEN');
  const clip = await telegram.download({ id: 'voice-1', mimeType: 'audio/ogg' });
  expect(clip).toEqual({ data: Buffer.from('voice bytes'), mimeType: 'audio/ogg' });
  expect(calls.map(({ url }) => url).slice(-2)).toEqual([
    'https://api.telegram.org/botTOKEN/getFile',
    'https://api.telegram.org/file/botTOKEN/voice/file_3.oga',
  ]);
});

test('isAdmin is true for the creator and the administrators only', async () => {
  const statuses = ['creator', 'administrator', 'member', 'restricted', 'left', 'kicked'];
  let next = 0;
  botApi(() => ok({ status: statuses[next++], user: nikos }));
  const telegram = await TelegramTransport.connect('TOKEN');
  const answers = [];
  for (let i = 0; i < statuses.length; i++) answers.push(await telegram.isAdmin('-1001234567890', '222'));
  expect(answers).toEqual([true, true, false, false, false, false]);
});

test('startLink opens a private chat with the payload and rejects an invalid payload', async () => {
  botApi();
  const telegram = await TelegramTransport.connect('TOKEN');
  expect(telegram.startLink('-1001234567890')).toBe(`https://t.me/${BOT}?start=-1001234567890`);
  expect(() => telegram.startLink('family 1')).toThrow();
  expect(() => telegram.startLink('x'.repeat(65))).toThrow();
});
