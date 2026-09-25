import { Logger } from '@nestjs/common';
import { setTimeout as sleep } from 'node:timers/promises';
import { cut } from '../core/lines';
import { Blocked, type Button, type Incoming, type Media, type Outgoing, type Person, type Transport } from '../core/types';
import { httpFetch } from '../http';
import { toOgg } from './voice';

const API = 'https://api.telegram.org';
const GROUP_TYPES = ['group', 'supergroup'];
const logger = new Logger('Telegram');

type User = { id: number; is_bot?: boolean; first_name: string; username?: string };
type Chat = { id: number; type: string };
type Message = {
  message_id: number;
  date: number;
  chat: Chat;
  from?: User;
  text?: string;
  caption?: string;
  photo?: { file_id: string; width: number; height: number }[];
  video?: { file_id: string; mime_type?: string; thumbnail?: { file_id: string } };
  voice?: { file_id: string; mime_type?: string };
  media_group_id?: string;
  forward_origin?: object;
  reply_to_message?: Message;
  migrate_to_chat_id?: number;
  animation?: object;
  document?: object;
  audio?: object;
};
export type Update = {
  update_id: number;
  message?: Message;
  callback_query?: { id: string; from: User; message?: Message; data?: string };
  my_chat_member?: { chat: Chat; from: User; date: number; old_chat_member: { status: string }; new_chat_member: { status: string } };
};

const person = (user?: User) => ({ id: String(user?.id ?? ''), name: user?.first_name ?? '' });

function place(chat: Chat) {
  const group = GROUP_TYPES.includes(chat.type);
  return { familyId: group ? String(chat.id) : undefined, chat: group ? ('group' as const) : ('private' as const), chatId: String(chat.id) };
}

function fromMessage(message: Message, username: string): Incoming {
  const text = (message.text ?? message.caption)?.replace(/^(\/\w+)@(\w+)/, (command: string, name: string, bot: string) =>
    bot.toLowerCase() === username.toLowerCase() ? name : command,
  );
  const photo = message.photo?.reduce((largest, size) => (size.width * size.height > largest.width * largest.height ? size : largest));
  const { video, voice, reply_to_message: reply } = message;
  const migratedTo = message.migrate_to_chat_id ? String(message.migrate_to_chat_id) : undefined;
  return {
    ...place(message.chat),
    messageId: String(message.message_id),
    sender: person(message.from),
    at: message.date * 1000,
    text,
    photo: photo && { id: photo.file_id, mimeType: 'image/jpeg' },
    video: video && { id: video.file_id, mimeType: video.mime_type },
    thumbnail: video?.thumbnail && { id: video.thumbnail.file_id, mimeType: 'image/jpeg' },
    voice: voice && { id: voice.file_id, mimeType: voice.mime_type ?? 'audio/ogg' },
    albumId: message.media_group_id,
    forwarded: Boolean(message.forward_origin),
    unsupported: Boolean(message.animation || message.document || message.audio) || !(text || photo || video || voice || migratedTo),
    replyTo: reply && String(reply.message_id),
    replyToSender: reply?.from && !reply.from.is_bot ? person(reply.from) : undefined,
    migratedTo,
  };
}

export function toIncoming(update: Update, username: string): Incoming | undefined {
  const { message, callback_query: query, my_chat_member: change } = update;
  if (message) return fromMessage(message, username);
  if (query?.message) {
    return { ...place(query.message.chat), messageId: String(query.message.message_id), sender: person(query.from), at: Date.now(), button: query.data };
  }
  const joined =
    change &&
    GROUP_TYPES.includes(change.chat.type) &&
    ['left', 'kicked'].includes(change.old_chat_member.status) &&
    ['member', 'administrator'].includes(change.new_chat_member.status);
  if (joined) return { ...place(change.chat), messageId: '', sender: person(change.from), at: change.date * 1000, joined: true };
  return undefined;
}

function mentionIn(text: string | undefined, person?: Person) {
  if (!text || !person?.name) return undefined;
  const name = person.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const offset = text.search(new RegExp(`(?<![\\p{L}\\p{N}])${name}(?![\\p{L}\\p{N}])`, 'u'));
  if (offset < 0) return undefined;
  return [{ type: 'text_mention', offset, length: person.name.length, user: { id: Number(person.id), is_bot: false, first_name: person.name } }];
}

// ponytail: the only upload is a voice note, so every Buffer goes up as <key>.ogg; pass a file name when a second upload kind appears
function encode(params: Record<string, unknown>) {
  if (!Object.values(params).some((value) => Buffer.isBuffer(value))) {
    return { headers: { 'content-type': 'application/json' }, body: JSON.stringify(params) };
  }
  const form = new FormData();
  for (const [key, value] of Object.entries(params)) {
    if (Buffer.isBuffer(value)) form.append(key, new Blob([value]), `${key}.ogg`);
    else if (value !== undefined) form.append(key, typeof value === 'string' ? value : JSON.stringify(value));
  }
  return { body: form };
}

const toButton = ({ label, data, url }: Button) => (url ? { text: label, url } : { text: label, callback_data: data });

async function call<T>(token: string, method: string, params: Record<string, unknown> = {}, signal = AbortSignal.timeout(30_000)): Promise<T> {
  const response = await httpFetch(`${API}/bot${token}/${method}`, { method: 'POST', ...encode(params), signal });
  const reply = (await response.json()) as { ok: boolean; result: T; error_code?: number; description?: string };
  if (reply.ok) return reply.result;
  // a user id is positive and a group id negative, so only a 403 from a private chat means the person blocked Anchor
  if (reply.error_code === 403 && typeof params.chat_id === 'string' && !params.chat_id.startsWith('-')) throw new Blocked(reply.description);
  if (reply.error_code === 409) throw new Error(`Another process polls this token: ${reply.description}`);
  throw new Error(`Telegram ${method} ${reply.error_code}: ${reply.description}`);
}

export class TelegramTransport implements Transport {
  private constructor(
    private readonly token: string,
    readonly username: string,
  ) {}

  static async connect(token: string, signal?: AbortSignal) {
    for (;;) {
      try {
        const me = await call<User>(token, 'getMe');
        return new TelegramTransport(token, me.username ?? '');
      } catch (error) {
        logger.error(`getMe failed, retrying in 5 s: ${error}`);
        await sleep(5000, undefined, { signal });
      }
    }
  }

  // ponytail: one update at a time, so a slow feature delays the next update; add a queue per chat when that hurts
  async poll(route: (event: Incoming) => Promise<void>, signal: AbortSignal) {
    let offset: number | undefined;
    while (!signal.aborted) {
      let updates: Update[] = [];
      try {
        // limit 1 confirms each update before the next one, so a restart repeats at most the update in flight
        const params = { offset, timeout: 30, limit: 1, allowed_updates: [] };
        updates = await call(this.token, 'getUpdates', params, AbortSignal.any([signal, AbortSignal.timeout(40_000)]));
      } catch (error) {
        if (signal.aborted) break;
        logger.error(`${error}`);
        await sleep(5000, undefined, { signal }).catch(() => undefined);
      }
      for (const update of updates) {
        offset = update.update_id + 1;
        try {
          if (update.callback_query) {
            void call(this.token, 'answerCallbackQuery', { callback_query_id: update.callback_query.id }).catch((error) => logger.warn(`${error}`));
          }
          const event = toIncoming(update, this.username);
          if (event) await route(event);
        } catch (error) {
          logger.error(`Update ${update.update_id} failed: ${error}`, error instanceof Error ? error.stack : undefined);
        }
      }
    }
  }

  async send(chatId: string, { text, photo, video, voice, album, mention, buttons, replyTo }: Outgoing) {
    const reply_parameters = replyTo ? { message_id: Number(replyTo), allow_sending_without_reply: true } : undefined;
    const caption = text && cut(text, 1024);
    const captioned = { caption, caption_entities: mentionIn(caption, mention) };
    if (album) {
      const media = album.map((item, index) => ({
        ...('video' in item ? { type: 'video', media: item.video.id } : { type: 'photo', media: item.photo.id }),
        ...(index === 0 ? captioned : {}),
      }));
      const sent = await call<Message[]>(this.token, 'sendMediaGroup', { chat_id: chatId, media, reply_parameters });
      return { messageId: String(sent[0].message_id), messageIds: sent.map((item) => String(item.message_id)) };
    }
    const params = {
      chat_id: chatId,
      reply_parameters,
      reply_markup: buttons?.length ? { inline_keyboard: buttons.map((button) => [toButton(button)]) } : undefined,
    };
    let sent: Message;
    if (video) sent = await call<Message>(this.token, 'sendVideo', { ...params, ...captioned, video: video.id });
    else if (photo) sent = await call<Message>(this.token, 'sendPhoto', { ...params, ...captioned, photo: photo.id });
    else if (voice) sent = await call<Message>(this.token, 'sendVoice', { ...params, ...captioned, voice: 'wav' in voice ? toOgg(voice.wav) : voice.id });
    else {
      const message = text && cut(text, 4096);
      sent = await call<Message>(this.token, 'sendMessage', { ...params, text: message, entities: mentionIn(message, mention) });
    }
    return { messageId: String(sent.message_id), voice: sent.voice && { id: sent.voice.file_id, mimeType: sent.voice.mime_type } };
  }

  async react(chatId: string, messageId: string, emoji: string, big?: boolean) {
    const reaction = [{ type: 'emoji', emoji: emoji.replace(/\uFE0F/g, '') }];
    await call(this.token, 'setMessageReaction', { chat_id: chatId, message_id: Number(messageId), reaction, is_big: big });
  }

  async download(media: Media) {
    const { file_path } = await call<{ file_path?: string }>(this.token, 'getFile', { file_id: media.id });
    const response = await httpFetch(`${API}/file/bot${this.token}/${file_path}`, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`Telegram file download ${response.status}`);
    return { data: Buffer.from(await response.arrayBuffer()), mimeType: media.mimeType ?? 'application/octet-stream' };
  }

  async isAdmin(chatId: string, userId: string) {
    const member = await call<{ status: string }>(this.token, 'getChatMember', { chat_id: chatId, user_id: Number(userId) });
    return member.status === 'creator' || member.status === 'administrator';
  }

  startLink(payload: string) {
    if (!/^[\w-]{1,64}$/.test(payload)) throw new Error(`A start payload holds 1 to 64 of A-Z, a-z, 0-9, _ and -: ${payload}`);
    return `https://t.me/${this.username}?start=${payload}`;
  }
}
