export type Media = { id: string; mimeType?: string };

export type Button = { label: string; data?: string; url?: string };

export type Incoming = {
  familyId?: string; // set for group events; the router resolves private events
  chat: 'group' | 'private';
  chatId: string;
  messageId: string;
  sender: { id: string; name: string };
  at: number; // real time in ms
  text?: string; // text or caption
  photo?: Media; // the largest size
  video?: Media;
  thumbnail?: Media; // the preview frame of the video, for the classification
  voice?: Media;
  albumId?: string; // Telegram media_group_id: photos of one album share it
  forwarded?: boolean;
  unsupported?: boolean; // sticker, GIF, video note, document, poll, service message
  replyTo?: string;
  replyToSender?: { id: string; name: string }; // the sender of the replied-to message
  migratedTo?: string; // the new chat id when the group became a supergroup
  button?: string; // the data of a pressed button
  joined?: boolean; // Anchor joined this group
};

export type Outgoing = {
  text?: string; // the caption when photo or voice is set
  photo?: Media; // set at most one of photo, video, voice, and album
  video?: Media;
  voice?: Media | { wav: Buffer };
  album?: Array<{ photo: Media } | { video: Media }>; // the caption goes on the first item; no buttons
  mention?: Person; // mentions the first occurrence of the name in the text
  buttons?: Button[];
  replyTo?: string;
};

export class Blocked extends Error {} // send throws Blocked when the person blocked Anchor

export interface Transport {
  send(chatId: string, message: Outgoing): Promise<{ messageId: string; messageIds?: string[]; voice?: Media }>; // messageIds: every message of an album
  react(chatId: string, messageId: string, emoji: string, big?: boolean): Promise<void>;
  download(media: Media): Promise<{ data: Buffer; mimeType: string }>;
  isAdmin(chatId: string, userId: string): Promise<boolean>;
  startLink(payload: string): string;
}

export type Person = { id: string; name: string };

export type Story = {
  id: string;
  by: Person;
  at: number; // demo-clock ms
  text: string; // the typed text or the transcript
  voice?: Media;
  messageIds: string[]; // group messages that carry the story
};

export type Moment = {
  id: string;
  by: Person;
  messageIds: string[]; // the group messages of the bundle
  savedAt: number; // demo-clock ms
  text: string; // the sender's own words, verbatim, or the title when wordless
  wordless?: boolean; // the sharer sent no words, so text holds the model's title
  photo?: Media;
  video?: Media; // a return shows the video when the moment has one
  voice?: Media;
  salience: number; // 1 to 5
  sensitive: boolean; // Anchor never brings the moment back
  people: string[];
  eventDate?: string; // YYYY-MM-DD
  title: string;
  invitationVoice?: Media; // the TTS clip of invitation(sender, text)
  stories: Story[];
  lookbacks: string[]; // '7', '30', '365', 'anniversary-2027'
  memoryPostIds: string[];
  returns: Record<string, { count: number; due: number }>; // private returns per member id
  echo?: string; // the id of the older moment that this moment echoes
  echoPostIds?: string[]; // the messages of the then-and-now post
};

export type Invitation = {
  momentId: string;
  day: number; // the demo-clock day index of the invitation
  messageIds: string[]; // the private messages of Anchor for this invitation
  story?: { text: string; voice?: Media };
  shareAsked: boolean;
  helped: boolean; // the gentle help went out once
  sentAt: number; // demo-clock ms of the delivery
  replied: boolean; // any reply, a question, or "What is this?" came
};

export type Member = Person & {
  started: boolean;
  lastInvitationDay?: number;
  invitation?: Invitation;
};

export type Family = {
  id: string; // the group chat id on the transport
  chatId: string; // the group chat id on the transport
  members: Member[];
  moments: Moment[];
  lastMemoryDay?: number;
  counters: Record<string, number>;
};

export type State = { clockStart: number; clockOffset: number; families: Family[] }; // clockOffset in ms, set by /fastforward

export type Window = { from: number; to: number }; // demo-clock ms

export interface Store {
  readonly state: State;
  family(id: string): Family | undefined;
  addFamily(id: string, chatId: string): Family;
  familyOfMember(userId: string): Family | undefined;
  save(): void;
}

export type Context = {
  now(): number; // demo-clock ms
  store: Store;
  transport(familyId: string): Transport;
};

export interface Feature {
  name: string;
  handle?(event: Incoming, family: Family | undefined, ctx: Context): Promise<boolean>;
  tick?(family: Family, window: Window, ctx: Context): Promise<void>;
}
