import { spawnSync } from 'node:child_process';
import { Logger } from '@nestjs/common';
import { beforeEach, expect, test, vi } from 'vitest';
import { lines } from '../core/lines';
import { Blocked } from '../core/types';
import { httpFetch, type HttpResponse } from '../http';
import { wav } from '../song';
import { TelegramTransport, toIncoming, type Update } from './telegram';

vi.mock('../http', () => ({ httpFetch: vi.fn() }));
// the long poll has its own connection in production; the tests route it through the same fake Bot API
vi.mock('./poll-fetch', async () => {
  const http = await import('../http');
  return { pollFetch: (url: string, init: RequestInit) => http.httpFetch(url, init) };
});
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

test('toIncoming maps the media group of an album photo as albumId, and leaves it unset for a single photo', () => {
  const photo = [{ ...file('album-1'), width: 1280, height: 960 }];
  expect(toIncoming(message({ photo, media_group_id: '13579246801357924' }), BOT)?.albumId).toBe('13579246801357924');
  expect(toIncoming(message({ photo }), BOT)?.albumId).toBeUndefined();
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

test('toIncoming leaves replyToSender unset for a reply to a bot', () => {
  const anchorBot = { id: 999, is_bot: true, first_name: 'Anchor' };
  const reply_to_message = { message_id: 41, from: anchorBot, chat: group, date, text: 'One week ago 💛' };
  const event = toIncoming(message({ text: '/private', reply_to_message }), BOT);
  expect(event?.replyTo).toBe('41');
  expect(event?.replyToSender).toBeUndefined();
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

test('toIncoming maps a group that became a supergroup to its new chat id', () => {
  const basicGroup = { id: -5486664452, title: 'The Pappas family', type: 'group', all_members_are_administrators: false };
  expect(toIncoming(message({ chat: basicGroup, message_id: 7, migrate_to_chat_id: -1003906123893 }), BOT)).toMatchObject({
    familyId: '-5486664452',
    chat: 'group',
    chatId: '-5486664452',
    migratedTo: '-1003906123893',
    unsupported: false,
  });
});

test('toIncoming keeps the first message of the new supergroup unsupported', () => {
  const groupBot = { id: 1087968824, is_bot: true, first_name: 'Group', username: 'GroupAnonymousBot' };
  const event = toIncoming(message({ message_id: 1, from: groupBot, sender_chat: group, migrate_from_chat_id: -5486664452 }), BOT);
  expect(event).toMatchObject({ unsupported: true });
  expect(event?.migratedTo).toBeUndefined();
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
function botApi(answer: (method: string) => HttpResponse = () => ok(sentMessage()), menu: () => HttpResponse = () => ok(true)) {
  const calls: BotCall[] = [];
  fetchMock.mockImplementation(async (url, init) => {
    const method = url.slice(url.lastIndexOf('/') + 1);
    const body = init?.body;
    const params = body instanceof FormData ? Object.fromEntries(body) : JSON.parse(String(body ?? '{}'));
    calls.push({ url, method, params });
    if (method === 'setMyCommands') return menu();
    return method === 'getMe' ? ok(anchorBot) : answer(method);
  });
  return calls;
}

test('poll takes one update at a time, advances past each one also when routing fails, and answers every button press', async () => {
  const stop = new AbortController();
  const pending = [message({ chat: privateChat, from: nikos, text: 'hello' }, 7), button(privateChat, 8)];
  const calls = botApi((method) => {
    if (method !== 'getUpdates') return ok(true);
    const next = pending.shift();
    if (!next) stop.abort();
    return ok(next ? [next] : []);
  });
  const telegram = await TelegramTransport.connect('TOKEN');
  const routed: string[] = [];
  await telegram.poll(async (event) => {
    routed.push(event.messageId);
    if (routed.length === 1) throw undefined;
  }, stop.signal);

  const polls = calls.filter(({ method }) => method === 'getUpdates').map(({ params }) => params);
  expect(polls.map(({ offset }) => offset)).toEqual([undefined, 8, 9]);
  expect(polls[0]).toMatchObject({ timeout: 30, limit: 1, allowed_updates: [] });
  expect(routed).toEqual(['42', '50']);
  expect(calls.filter(({ method }) => method === 'answerCallbackQuery').map(({ params }) => params.callback_query_id)).toEqual(['q8']);
});

test('connect retries getMe 5 seconds after a failure', { timeout: 15_000 }, async () => {
  let attempts = 0;
  fetchMock.mockImplementation(async () => {
    attempts += 1;
    if (attempts === 1) throw new TypeError('fetch failed');
    return ok(anchorBot);
  });
  const telegram = await TelegramTransport.connect('TOKEN');
  expect(attempts).toBe(5); // two getMe calls, then the three menus
  expect(telegram.startLink('abc')).toBe(`https://t.me/${BOT}?start=abc`);
});

test('connect registers the command menu for group admins and for private chats', async () => {
  const calls = botApi(() => ok(true));
  await TelegramTransport.connect('TOKEN');
  expect(calls.filter(({ method }) => method === 'setMyCommands').map(({ params }) => params)).toEqual([
    { commands: lines.commands.group, scope: { type: 'all_group_chats' } },
    { commands: lines.commands.admins, scope: { type: 'all_chat_administrators' } },
    { commands: lines.commands.private, scope: { type: 'all_private_chats' } },
  ]);
});

test('a failed menu registration only logs, and connect still returns the transport', async () => {
  const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  botApi(() => ok(true), () => failed(400, 'Bad Request'));
  const telegram = await TelegramTransport.connect('TOKEN');
  expect(telegram.username).toBe(BOT);
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('The command menu failed'));
  warn.mockRestore();
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
          [{ text: 'Not now', callback_data: 'not-now' }],
          [{ text: 'Start', url: `https://t.me/${BOT}?start=-1001234567890` }],
        ],
      },
    },
  });
});

test('send puts each button in its own row', async () => {
  const calls = botApi();
  const telegram = await TelegramTransport.connect('TOKEN');
  await telegram.send('222', {
    text: 'Pick one',
    buttons: [
      { label: 'One', data: 'one' },
      { label: 'Two', data: 'two' },
      { label: 'Three', data: 'three' },
    ],
  });
  expect(calls.at(-1)?.params.reply_markup).toEqual({
    inline_keyboard: [[{ text: 'One', callback_data: 'one' }], [{ text: 'Two', callback_data: 'two' }], [{ text: 'Three', callback_data: 'three' }]],
  });
});

test('send posts a video by its file id with the caption', async () => {
  const calls = botApi();
  const telegram = await TelegramTransport.connect('TOKEN');
  await telegram.send('222', { video: { id: 'video-1', mimeType: 'video/mp4' }, text: 'Sofia shared: «Our trip»' });
  expect(calls.at(-1)).toMatchObject({ method: 'sendVideo', params: { chat_id: '222', video: 'video-1', caption: 'Sofia shared: «Our trip»' } });
});

test('send shows the video when a message also sets a photo', async () => {
  const calls = botApi();
  const telegram = await TelegramTransport.connect('TOKEN');
  await telegram.send('222', { photo: { id: 'large' }, video: { id: 'video-1' }, text: 'Our trip' });
  expect(calls.at(-1)?.method).toBe('sendVideo');
});

test('send never cuts a caption inside an emoji', async () => {
  const calls = botApi();
  const telegram = await TelegramTransport.connect('TOKEN');
  await telegram.send('222', { photo: { id: 'large' }, text: `${'x'.repeat(1023)}😀 and more` });
  expect(calls.at(-1)?.params.caption).toBe('x'.repeat(1023));
});

test('send posts an album with the caption on the first item and returns every album message id', async () => {
  const calls = botApi(() => ok([sentMessage({ message_id: 80 }), sentMessage({ message_id: 81 })]));
  const telegram = await TelegramTransport.connect('TOKEN');
  const sent = await telegram.send('-1001234567890', {
    album: [{ video: { id: 'video-1' } }, { photo: { id: 'large' } }],
    text: 'y'.repeat(1100),
    buttons: [{ label: 'Not now', data: 'not-now' }],
  });
  expect(sent).toEqual({ messageId: '80', messageIds: ['80', '81'] });
  expect(calls.at(-1)).toEqual({
    url: 'https://api.telegram.org/botTOKEN/sendMediaGroup',
    method: 'sendMediaGroup',
    params: {
      chat_id: '-1001234567890',
      media: [
        { type: 'video', media: 'video-1', caption: 'y'.repeat(1024) },
        { type: 'photo', media: 'large' },
      ],
    },
  });
});

test('send mentions the first occurrence of the name, with offsets in UTF-16 units', async () => {
  const calls = botApi();
  const telegram = await TelegramTransport.connect('TOKEN');
  const sofiaPerson = { id: '111', name: 'Sofia' };
  await telegram.send('-1001234567890', { text: '🎙️ Nikos added a story to Sofia\'s moment', mention: sofiaPerson });
  expect(calls.at(-1)?.params.entities).toEqual([
    { type: 'text_mention', offset: 27, length: 5, user: { id: 111, is_bot: false, first_name: 'Sofia' } },
  ]);
  await telegram.send('-1001234567890', { photo: { id: 'large' }, text: 'Sofia shared this', mention: sofiaPerson });
  expect(calls.at(-1)?.params.caption_entities).toEqual([
    { type: 'text_mention', offset: 0, length: 5, user: { id: 111, is_bot: false, first_name: 'Sofia' } },
  ]);
});

test('send mentions the name as a whole word, not inside a longer name', async () => {
  const calls = botApi();
  const telegram = await TelegramTransport.connect('TOKEN');
  await telegram.send('-1001234567890', { text: "Marianna added a story to Maria's moment 🎙️", mention: { id: '111', name: 'Maria' } });
  expect(calls.at(-1)?.params.entities).toEqual([
    { type: 'text_mention', offset: 26, length: 5, user: { id: 111, is_bot: false, first_name: 'Maria' } },
  ]);
});

test('send adds no mention when the text does not hold the name', async () => {
  const calls = botApi();
  const telegram = await TelegramTransport.connect('TOKEN');
  await telegram.send('-1001234567890', { text: 'Nikos added a story', mention: { id: '111', name: 'Sofia' } });
  expect(calls.at(-1)?.params.entities).toBeUndefined();
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

test('a 403 from a group is an ordinary error, not Blocked', async () => {
  botApi(() => failed(403, 'Forbidden: bot was kicked from the supergroup chat'));
  const telegram = await TelegramTransport.connect('TOKEN');
  const sending = telegram.send('-1001234567890', { text: 'hello' });
  await expect(sending).rejects.toThrow(/kicked/);
  await expect(sending).rejects.not.toBeInstanceOf(Blocked);
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

test('react with big sets the big animation', async () => {
  const calls = botApi(() => ok(true));
  const telegram = await TelegramTransport.connect('TOKEN');
  await telegram.react('-1001234567890', '42', '\u2764', true);
  expect(calls.at(-1)?.params).toMatchObject({ reaction: [{ type: 'emoji', emoji: '\u2764' }], is_big: true });
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
  botApi((method) => (method === 'getChatMember' ? ok({ status: statuses[next++], user: nikos }) : ok(true)));
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

test('toIncoming maps an ephemeral command with its ephemeral message id', () => {
  expect(toIncoming(message({ message_id: 0, ephemeral_message_id: 900, text: `/fastforward@${BOT} 7` }), BOT)).toMatchObject({
    chat: 'group',
    messageId: '900',
    ephemeral: true,
    text: '/fastforward 7',
  });
  expect(toIncoming(message({ text: 'hello' }), BOT)?.ephemeral).toBeUndefined();
});

test('toIncoming maps a tap on an ephemeral message with its ephemeral message id', () => {
  const tap = button(group);
  tap.callback_query.message = { ...tap.callback_query.message, message_id: 0, ephemeral_message_id: 901 } as typeof tap.callback_query.message;
  expect(toIncoming(tap, BOT)).toMatchObject({ familyId: '-1001234567890', chat: 'group', messageId: '901', ephemeral: true, button: 'not-now' });
});

test('toIncoming maps a shared contact with its Telegram user id', () => {
  const shared = message({ chat: privateChat, from: nikos, contact: { phone_number: '306912345678', first_name: 'Nikos', user_id: 222 } });
  expect(toIncoming(shared, BOT)).toMatchObject({ chat: 'private', unsupported: false, contact: { phone: '306912345678', userId: '222' } });
  const card = message({ chat: privateChat, from: nikos, contact: { phone_number: '+302101234567', first_name: 'Eleni' } });
  expect(toIncoming(card, BOT)?.contact).toEqual({ phone: '+302101234567', userId: undefined });
});

test('send with onlyFor sends an ephemeral message and returns the ephemeral message id', async () => {
  const calls = botApi(() => ok(sentMessage({ message_id: 0, ephemeral_message_id: 6819514 })));
  const telegram = await TelegramTransport.connect('TOKEN');
  const sent = await telegram.send('-1001234567890', { text: 'Shall I send this to Nikos now?', buttons: [{ label: 'Yes, send it', data: 'shr:yes:a1' }], onlyFor: '222' });
  expect(sent).toEqual({ messageId: '6819514', voice: undefined });
  expect(calls.at(-1)).toMatchObject({
    method: 'sendMessage',
    params: {
      chat_id: '-1001234567890',
      text: 'Shall I send this to Nikos now?',
      ephemeral_message_parameters: { receiver_user_id: 222 },
      reply_markup: { inline_keyboard: [[{ text: 'Yes, send it', callback_data: 'shr:yes:a1' }]] },
    },
  });
});

test('send posts a contact card', async () => {
  const calls = botApi();
  const telegram = await TelegramTransport.connect('TOKEN');
  await telegram.send('222', { contact: { phone: '+15551234567', name: 'Anchor' } });
  expect(calls.at(-1)).toMatchObject({ method: 'sendContact', params: { chat_id: '222', phone_number: '+15551234567', first_name: 'Anchor' } });
});

test('send turns a contact button into a one-time reply keyboard', async () => {
  const calls = botApi();
  const telegram = await TelegramTransport.connect('TOKEN');
  await telegram.send('222', { text: 'To call you, I need your phone number.', buttons: [{ label: 'Share my phone number', contact: true }] });
  expect(calls.at(-1)?.params.reply_markup).toEqual({
    keyboard: [[{ text: 'Share my phone number', request_contact: true }]],
    one_time_keyboard: true,
    resize_keyboard: true,
  });
});

test('edit replaces the text, or only the buttons, of a message', async () => {
  const calls = botApi(() => ok(true));
  const telegram = await TelegramTransport.connect('TOKEN');
  await telegram.edit('222', '77', { text: 'All set 💛', buttons: [{ label: 'My settings', data: 'nxt:settings' }] });
  expect(calls.at(-1)).toMatchObject({
    method: 'editMessageText',
    params: { chat_id: '222', message_id: 77, text: 'All set 💛', reply_markup: { inline_keyboard: [[{ text: 'My settings', callback_data: 'nxt:settings' }]] } },
  });
  await telegram.edit('222', '77', { buttons: [{ label: '✅ Family moments now and then', data: 'set:moments' }] });
  expect(calls.at(-1)).toMatchObject({
    method: 'editMessageReplyMarkup',
    params: { chat_id: '222', message_id: 77, reply_markup: { inline_keyboard: [[{ text: '✅ Family moments now and then', callback_data: 'set:moments' }]] } },
  });
});

test('edit with onlyFor edits an ephemeral message', async () => {
  const calls = botApi(() => ok(true));
  const telegram = await TelegramTransport.connect('TOKEN');
  await telegram.edit('-1001234567890', '6819514', { text: 'Sent to Nikos 💛', onlyFor: '222' });
  expect(calls.at(-1)).toEqual({
    url: 'https://api.telegram.org/botTOKEN/editEphemeralMessageText',
    method: 'editEphemeralMessageText',
    params: { chat_id: '-1001234567890', receiver_user_id: 222, ephemeral_message_id: 6819514, text: 'Sent to Nikos 💛' },
  });
  await telegram.edit('-1001234567890', '6819514', { buttons: [], onlyFor: '222' });
  expect(calls.at(-1)).toMatchObject({
    method: 'editEphemeralMessageReplyMarkup',
    params: { chat_id: '-1001234567890', receiver_user_id: 222, ephemeral_message_id: 6819514, reply_markup: { inline_keyboard: [] } },
  });
});

test('remove deletes a message, or an ephemeral message with onlyFor', async () => {
  const calls = botApi(() => ok(true));
  const telegram = await TelegramTransport.connect('TOKEN');
  await telegram.remove('222', '77');
  expect(calls.at(-1)).toMatchObject({ method: 'deleteMessage', params: { chat_id: '222', message_id: 77 } });
  await telegram.remove('-1001234567890', '6819514', '222');
  expect(calls.at(-1)).toMatchObject({
    method: 'deleteEphemeralMessage',
    params: { chat_id: '-1001234567890', receiver_user_id: 222, ephemeral_message_id: 6819514 },
  });
});

test('the admin menu registers /fastforward as an ephemeral command and has no /private or /send', () => {
  const commands = [...lines.commands.group, ...lines.commands.admins, ...lines.commands.private].map(({ command }) => command);
  expect(commands).not.toContain('private');
  expect(commands).not.toContain('send');
  expect(lines.commands.admins.find(({ command }) => command === 'fastforward')).toMatchObject({ is_ephemeral: true });
});

test('a Bot API call over 5 seconds logs its method and duration', async () => {
  botApi(() => ok(true));
  const telegram = await TelegramTransport.connect('TOKEN');
  const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  const now = vi.spyOn(Date, 'now').mockReturnValueOnce(0).mockReturnValueOnce(29_000);
  await telegram.react('-1001234567890', '42', '✍');
  expect(warn).toHaveBeenCalledWith('Telegram setMessageReaction took 29.0 s');
  now.mockRestore();
  warn.mockRestore();
});
