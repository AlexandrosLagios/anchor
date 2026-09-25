# Design: Anchor, the family's memory keeper

- Date: 2026-09-25.
- Source spike: `docs/spikes/2026-09-25-family-group-chat-spike.md`, commit `b182cdf` on `main`.
- Base commit for the first steps: `0c92feb` on `main`.
- Status: sections 1 to 4 approved in the `/shape` session. The step order follows the v1 direction of the same session.
- Scope: the Telegram bot in `apps/api`. The website in `apps/web` and the prototype engine that serves the website stay untouched.

## 1. Framing

The team's journey document for Challenge #12 (older adults who live independently) sets the framing. Its persona is a grandfather who lives on his own and has a recent MCI diagnosis. His daughter shares everyday moments in the family group chat, and he has his own stories to tell.

Anchor is a member of the family group chat. Anchor keeps the family's shared moments, brings them back so the family can relive them together, and invites the grandparents to add their stories. The design centres on the member for whom the moments are most fragile, and that makes it better for everyone.

- Anchor is a keeper of the family's memories, never a member of the family. Anchor says that it is not a person.
- Anchor quotes each moment in the words of the person who shared it, and attributes each moment to that person. Anchor never claims feelings or a shared past of its own.
- The grandparents are contributors and storytellers, not receivers of help.
- The memory benefit is honest but is not the label. Only the private welcome to a storyteller mentions it.
- No line that Anchor sends mentions memory loss, cognitive impairment, recall, tests, hints, or scores. A return is an invitation to relive a moment, never a question with a right answer.
- Success is the moments that the family shares, not how much anyone talks to Anchor.

## 2. Changes to the spike

The spike stays the source for the platform research and for the rejected platforms. This design changes the product decisions of the spike as follows.

- Kept: decisions 1, 2, 5, 6, 8, 9, and 10.
- Changed in decision 8: Anchor keeps a sensitive moment (a loss, grief, or illness) and never brings it back. Journey step 6 keeps painful memories in the family's story, and a person decides when they return.
- Replaced: decisions 3, 4, and 7. Section 4 of this design replaces them.
- Settled open questions:
  - Persona: Anchor takes every name from the transport. The team plays the family in a test group.
  - Language: English. Every fixed line lives in `core/lines.ts`.
  - Cloud Run: one always-on service, `anchor-bot`, with the JSON file on a Cloud Storage volume. The API of the website deploys to Vercel as `anchor-api` and stays as it is. At list price, 1 vCPU and 512 MiB always on cost about 1.64 USD per day before the free tier.
  - Archive: the record only. Anchor keeps what the filter saves and drops every other message.
  - The website: out of scope. A later website simulation becomes one more transport (section 5.1).
- Removed open question: the clinical review of the ladder. This design has no training ladder.
- Still open: the hackathon brief, because the `notion-openconf` server returns `401 unauthorized`. The team owns the pitch wording and the website copy.

## 3. Milestones

- **v1**: the team tests Anchor in a Telegram group, then rehearses the demo. One laptop runs the API with long polling, so the first test needs no deploy. Steps 1, 1b, 2, 2b, and 3 build v1, including Ask Anchor and the demo additions of section 4.10.
- **v1.x**: the changes that the v1 findings ask for.

Step 3 writes the v1 findings into section 11. Read section 11 before a v1.x change starts.

## 4. Behaviour

### 4.1 Roles

- A family member is any person in the group.
- A storyteller is a grandparent. A group admin replies `/private` to a message of the grandparent. Anchor then posts a Start button.
- The grandparent taps the Start button once. Telegram lets a bot write in a private chat only after that tap.

### 4.2 Capture

1. The code rules drop unsupported messages (stickers, GIFs, video notes, documents, polls, service messages), forwarded messages, commands (text that starts with `/`), and texts that hold only links. A video is supported.
2. The bundler groups the messages of one sender in one family. A message joins the newest open bundle of its sender when the message arrives within 5 minutes of the previous one. A photo or a video starts a new bundle when that bundle already holds a picture from outside its Telegram album (`Incoming.albumId`), and the older bundle closes at the next tick. A text or a voice note joins the newest open bundle.
3. A bundle closes 5 minutes after its last message. A bundle that holds a photo or a video, and words, closes at the next tick. When the last message of that bundle belongs to a Telegram album, the bundle waits 3 seconds before that close, because the poller gets the album one message at a time. Words are a text, a caption, or a voice note.
4. The code drops a closed bundle that has no photo, no video, no voice note, and fewer than 3 words. A bundle that has a picture and no words is kept: the classification sees the picture, or the video thumbnail, and gives it a title.
5. One Gemini call classifies the bundle (section 6.2). The call gets the texts, the first photo or the thumbnail of the first video, and the voice note of the bundle. The code never downloads a video, because a bot downloads at most 20 MB.
6. The code saves a `family_moment` and a `sensitive` moment, and drops the rest. A `sensitive` verdict sets `moment.sensitive`. Then Anchor reacts with ❤ on the first message of the bundle.
7. `moment.text` holds the typed words of the bundle. A bundle without typed words uses the transcript of its voice note. When both are empty, `moment.text` is the title, `moment.wordless` is true, and `moment.text` is never empty.
8. Every line that quotes a moment uses `sharedBy(moment)`: `{sender} shared: «{text}»`, or `{sender} shared a photo: {title}` (a video, a voice note) for a wordless moment. Anchor never quotes the model's words as the sharer's words.
9. The code counts each outcome in `family.counters`: `rules`, `family_moment`, `logistics`, `small_talk`, `sensitive`, and `failed`.

The bundler uses real time, because people type in real time. Every other rule in section 4 uses the demo clock (section 4.8).

### 4.3 Group memories

- The 18:00 slot posts at most one group memory per family per day.
- A moment is due for a lookback when 7, 30, or 365 days have passed since `savedAt`, and the age is not in `moment.lookbacks`.
- A moment is due for an anniversary when its `eventDate` has the month and the day of today and a year before this year. The key `anniversary-<this year>` must not be in `moment.lookbacks`.
- When several keys are due for one moment, the code posts one memory. The anniversary wins, and otherwise the highest age wins. The code marks every due key as done.
- The code skips every moment whose `sensitive` flag is true.
- `byPriority` in `core/priority.ts` orders the due moments: anniversary first, then the higher salience, then the older `savedAt`.
- The post is the video or the photo with the caption `memoryCaption(label, moment)`, which uses `sharedBy(moment)`. The video wins when the moment has both. A moment without a photo posts the caption as text. The code adds the message id of the post to `moment.memoryPostIds`.
- An admin sends `/memory` in the group to post a memory at once. `/memory` posts the first due moment with its label.
- When no moment is due, `/memory` posts the moment with the fewest memory posts, with the label `fromRecord`. `byPriority` breaks a tie.
- `/memory` does not change `lastMemoryDay`. When the family has no moment, `/memory` gets `nothingToShare`.

### 4.4 Group stories

- A group message that replies to a memory post is a story when the message is supported, not forwarded, and holds a voice note or at least 3 words. A reply that matches the ask pattern of section 4.6 goes to `ask` instead. A reply to a then-and-now post is not a story.
- A voice story gets one Gemini transcription (section 6.3).
- The code appends the story to the moment. Then Anchor reacts with ❤ on the story message.

### 4.5 Story invitations

Moments come back to a storyteller more often than to the group, in private, at 11:00. Each return is an invitation to relive the moment.

- The 11:00 slot sends at most one invitation per started storyteller per day.
- A moment qualifies when the storyteller did not send it, it is not sensitive, and it is at least 3 demo-clock hours old. `moment.returns[storytellerId].due` must be at or before now. A missing entry counts as due.
- `byPriority` picks the first qualifying moment.
- Anchor sends the video or the photo first. Then Anchor sends a voice note of `invitation(moment)`, with the text as the caption and the buttons "Not now", "Don't bring this back", and "What is this?". When no voice clip exists, Anchor sends the text with the buttons.
- "What is this?", or a reply of kind `question`, gets `tellDirectly(title, date, sender)`, then the sender's voice note when the moment has one (user story 5, "Just ask"). The invitation stays open for a story, and the answer never hints that he should have known.
- An invitation with no reply for 3 demo-clock hours gets `gentleHelp(date, title)` once, like a hesitant reply (user story 4). `Invitation.sentAt` and `Invitation.replied` drive this rule.
- The code makes the TTS clip once per moment. The transport returns a media id for the uploaded clip, and the code stores the id in `moment.invitationVoice`.
- After each delivered invitation, the code increments `count` and sets `due` to the slot time plus the next gap. The gaps are 1, 2, 4, 8, 16, and 32 days. After the seventh return, the moment gets no more private returns.
- A delivered invitation counts as a return whether or not the storyteller answers. Silence is never read as forgetting, and nobody is watched.
- "Not now" sends `notNow`, sets `due` to the next day's slot, and keeps `count`. "Don't bring this back" sets `sensitive` and sends `dontBringBack`. Both close the invitation.
- One Gemini call reads each private reply (section 6.3) and returns a `kind`:
  - `story`: the reply adds to one story, which joins the texts and the transcripts and keeps the first voice note. After the first story reply, Anchor sends `thanks` with the buttons "Yes, share it" and "No, thanks".
  - `unsure`, the first time: Anchor sends `gentleHelp(date, title)`, then the sender's voice note by its media id when the moment has one. The invitation stays open, and `helped` becomes true.
  - `unsure` after the help, or `other`: Anchor sends `warmClose`, and the invitation closes.
- "Yes, share it" posts `storyAdded(name, sender, story)` in the group as a reply to the first message of the moment, with a mention of the sender (section 4.10). The voice note follows by its media id. Then the code appends the story to the moment and sends `shared` in private.
- "No, thanks" sends `notShared`, closes the invitation, and stores no story.
- An invitation that is still open at the next 11:00 slot closes without a message.
- An admin sends `/send` in the group to send an invitation to every started storyteller at once. An open invitation closes first.
- `/send` skips the 3-hour rule and the due check. `/send` picks the moment with the lowest return count, and `byPriority` breaks a tie. When no moment qualifies for a storyteller, Anchor posts `nothingToInvite(name)` in the group.

### 4.6 Ask Anchor (step 2b)

- A group message that matches `/^anchor\b[,:]?\s+/i` is a question. The `forget` feature runs first, so "Anchor, forget this" never reaches `ask`.
- One Gemini call picks one moment id from an enum of the ids of the family, or `none` (section 6.4). The enum leaves out every sensitive moment.
- Anchor replies to the question with the video or the photo and the caption `askAnswer(title, date, names)`. The first voice story follows by its media id.
- `none`, or a failed call, gets `notFound`.

### 4.7 Commands and fixed replies

- When Anchor joins a group, Anchor creates the family and posts `intro`.
- `/private`, sent by an admin as a reply to the message of a member, registers `event.replyToSender` as a storyteller. Anchor posts `storytellerStart(name)` with a URL button to `transport.startLink(family id)`.
- `/start` in private, from a registered storyteller, gets `welcome(name)` with the buttons "Yes, I'd like that" and "Not now" (user story 1, "Say yes myself"). Only "Yes, I'd like that" sets `started` and sends `agreed(name)`. "Not now" sends `notNow`. Nothing comes back to a storyteller before that yes. Moments shared before the yes come back after it.
- `/stop`, or the single word "stop" in private, sets `started` to false, closes the open invitation silently, and sends `stopped`. Nothing more comes back until `/start` and a new yes. The family is not told.
- "Anchor, forget this", sent as a reply, deletes the moment or the story that owns the replied-to message. Anchor reacts with 👌. An Ask Anchor answer belongs to its moment, because `ask` adds the answer post to `memoryPostIds`.
- A forget that replies to either photo of a then-and-now post deletes neither moment and gets `forgetWhich`. "Anchor, don't bring this back" on that post changes nothing and gets `quietWhich`. One reply never deletes two moments on a guess.
- `forgetWhich` and `quietWhich` carry one button per moment, labelled with the sender and the title cut to 40 characters, with the data `fgt:<momentId>` or `qt:<momentId>`. A tap acts on that moment only, and Anchor reacts with 👌 on the question.
- `echoes` stores every album message id as `Moment.echoPostIds` on the newer moment. `send` returns `messageIds` for an album. This rule lands in a follow-up PR after the step 2 PR.
- "Anchor, don't bring this back", sent as a reply, sets `sensitive` on the moment that owns the replied-to message. The moment stays in the record, and Anchor reacts with 👌.
- The `forget` feature and the `capture` feature share the open bundles in `capture.ts`. A forget on a message of an open bundle drops that bundle at once.
- Every member can send `/memory` (section 4.3). `/private`, `/send`, and `/fastforward` are admin commands. A member who is not an admin and sends one of them gets `adminOnly` in the group, and nothing changes.
- `/private`, as a reply to a member's message, lets that member get family moments in private. `/send` sends a moment to each private member now.
- The bot registers a "/" menu with `setMyCommands`. In a group, every member sees `/memory`, and only admins see `/private`, `/send`, and `/fastforward`. In a private chat, everyone sees `/start` and `/stop`. The descriptions live in `core/lines.ts`.
- A private message that no feature handles gets `noInvitation` from a started storyteller, and `notJoined` from a storyteller who has not said yes or who stopped. Any other person gets `pointer`.

### 4.8 Clock

- `now()` returns the demo-clock time: `clockStart + (realNow - clockStart) * 86400 / ANCHOR_DAY_SECONDS + clockOffset`.
- The store sets `State.clockStart` once, at the first boot, so a restart keeps the timeline.
- The slots use local time. Set `TZ=Europe/Athens` when the host runs in UTC.

### 4.9 Fixed lines (`core/lines.ts`)

| Key | Text |
| --- | --- |
| `intro` | Hi, I'm Anchor 👋 I'm not a person: I keep this family's photos and stories, each one in the words of the person who shared it. When someone shares a moment worth keeping, I save it and react with ❤. Now and then I bring a moment back, so it stays with all of us. An admin can reply /private to a grandparent's message. Reply "Anchor, forget this" to delete a moment, or "Anchor, don't bring this back" to keep it without bringing it back. This is a test build, so please share staged photos only. |
| `storytellerStart(name)` | {name}, the family would love your stories 💛 Tap Start, and now and then I'll send you a family moment. |
| `welcome(name)` | Hello {name} 🙂 I'm Anchor. I'm not a person: I keep your family's photos and stories. Now and then, and a little more often for you, I'll send you a moment the family shared. Seeing moments again helps them stay with us. You can answer by voice or by text. There's no right answer, I share nothing unless you say yes, and you can send /stop at any time. Would you like that? |
| `sharedBy(moment)` | {sender} shared: «{text}», or {sender} shared a photo: {title} (a video, a voice note) when the moment is wordless |
| `invitation(moment)` | {sharedBy(moment)} (new line) What does it remind you of? |
| `memoryCaption(label, moment)` | {label} 💛 (new line) {sharedBy(moment)} (new line) Reply with a story or a voice note to add it to the family record. |
| labels | `7` One week ago · `30` One month ago · `365` One year ago · anniversary On this day in {year} · `fromRecord` From the family record |
| `gentleHelp(date, title)` | No rush 🙂 This is from {date}: {title}. Any memory it brings is welcome. |
| `warmClose` | Thank you 💛 |
| `agreed(name)` | Wonderful, {name} 💛 I'll send you the first moment soon. |
| `stopped` | Of course. I won't send you any more moments. If you'd like them again, send /start. |
| `tellDirectly(title, date, sender)` | This is {title}, from {date}. {sender} shared it 💛 |
| `thanks` | Thank you for the story 💛 Shall I share it with the family? |
| `shared` | Done, the family can hear it now 💛 |
| `notShared` | Of course. I won't share it. |
| `notNow` | No problem 🙂 Another time. |
| `dontBringBack` | Of course. I'll keep it, and I won't bring it back. |
| `storyAdded(name, sender, story)` | {name} added a story to {sender}'s moment 🎙️ (new line) «{story}» |
| `echoCaption(earlier, later)` | Then and now 💛 (new line) {sharedBy(earlier)} (new line) {sharedBy(later)} |
| `fastforwarded(date)` | ⏩ It's now {date} on the family clock. |
| `fastforwardUsage` | Send /fastforward and a number of days, for example /fastforward 7. |
| `askAnswer(title, date, names)` | {title} · {date} 💛 plus "Stories from {names}" when the moment has stories |
| `notFound` | I couldn't find that in the family record yet. |
| `noInvitation` | Thank you 🙂 I'll bring you a family moment soon. |
| `pointer` | Hi! I keep your family's record. Talk to me in your family group 🙂 |
| `adminOnly` | Only a group admin can do that 🙂 |
| `notJoined` | Thank you 🙂 If you'd like family moments from me, send /start. |
| `forgetWhich` | This post shows two moments. Which one should I forget? (one button per moment) |
| `quietWhich` | This post shows two moments. Which one should I stop bringing back? (one button per moment) |
| `voiceNote` | 🎤 voice note |
| `nothingToShare` | The family record is empty so far. Share a photo with a few words 🙂 |
| `nothingToInvite(name)` | {name} has seen every moment so far. |

The buttons read "Start", "Yes, I'd like that", "Not now", "Don't bring this back", "What is this?", "Yes, share it", and "No, thanks".

`invitation`, `memoryCaption`, and `storyAdded` clip the quoted text to 600 characters, and `echoCaption` clips each of its two quotes to 450 characters. Each clip ends with "…". Every caption then stays under the Telegram limit of 1024 characters, and the invitation voice note stays short. The step 1 session writes every line. A feature step asks that session for a wording change, and no line may break section 1.

### 4.10 Demo additions

These additions put journey steps 2 and 5 on stage, and they let the live demo run on cue.

- **Then and now** (step 2b): on each tick, the `echoes` feature checks each moment that was saved inside the window, is not sensitive, and has no `echo`.
  - One Gemini call picks an older moment that echoes the new one, or `none` (section 6.6). The older moment must come from a different sender and must not be sensitive.
  - On a match, Anchor posts an album of the two videos or photos, with the earlier life event first, and the caption `echoCaption(earlier, later)`. The album caption is cut at 1024 characters.
  - The earlier life event is the moment with the older `eventDate` when both moments have one. Otherwise, the echo call decides (section 6.6), and the fallback is the older `savedAt`.
  - When only one moment has a picture, the post is that single photo or video with the caption. When neither has one, the post is the caption as text.
  - The code sets `echo` on the new moment, so each new moment gets at most one echo post.
- **The story reaches the sharer** (step 2): the group post of a shared story is `storyAdded(name, sender, story)`, with `mention` set to the sender of the moment. The post quotes the story, clipped to 600 characters. Anchor reacts with a big ❤ on the post.
- **Stage time travel** (step 2b): an admin sends `/fastforward <days>`, with 1 to 400 days. The `fastforward` feature adds the days to `State.clockOffset`, saves, and replies `fastforwarded(date)`. The next tick sees the jump as one window, so each slot feature fires at most once. An invalid argument gets `fastforwardUsage`.
- **The demo script** (step 3): the team test ends with a written 3-minute script that walks journey steps 1 to 6, and the team rehearses the script twice.

## 5. Architecture

### 5.1 Extension points

- **Transport**: one interface. v1 has the Telegram transport and a fake transport for the tests. Each transport turns its input into one `Incoming` event type. A later WhatsApp route, the `apps/mobile` app, or a website simulation becomes one more implementation.
- **Feature**: an object with an optional `handle` and an optional `tick`. The router offers each event to the features in a fixed order, and the first feature that returns `true` owns the event. Every 2 seconds, the router gives each feature the demo-clock window since the last tick.
- **Record**: the server holds the family memory in one `State`. A later feature adds its own typed fields to `Family`, and the JSON file needs no migration.

Not built: a plugin loader, per-family feature flags, an event bus, a message archive, and a second language. Add each one when a family needs it.

Parked from the journey document, for after the v1 team test: the Lovely / Tell Eleni / Later quick replies, the response states (engaged, partial, no reply, distress), a reminder to a family member about a sensitive moment, a slot time per storyteller, consent that the family renews over time, and support that decreases as recall improves.

### 5.2 Files

All paths are under `apps/api/src/app/`.

| Path | Step | Purpose |
| --- | --- | --- |
| `core/types.ts` | 1 | The contract in section 5.3. |
| `core/store.ts` | 1 | Loads and saves `State` as one JSON file. |
| `core/clock.ts` | 1 | The demo clock, the local day index, and `slotIn(window, hour)`. `slotIn` returns the latest local `hour:00` inside the window, or `undefined`. |
| `core/priority.ts` | 1 | `byPriority(now)` and `isAnniversary(eventDate, now)`. |
| `core/router.ts` | 1 | `route(event)`, `tick(window)`, and the private fallback. |
| `core/lines.ts` | 1 | Every line of section 4.9. |
| `core/fake-transport.ts` | 1 | An in-memory `Transport` for the tests. |
| `features/intro.ts` | 1 | The `joined` event. |
| `family.service.ts` | 1 | The Nest host: store, context, `FEATURES`, the tick loop, and the poll. |
| `transports/telegram.ts` | 1 | The Bot API client, `toIncoming`, the poll loop, and `TelegramTransport`. |
| `transports/voice.ts` | 1 | WAV to OGG Opus through `ffmpeg`. |
| `gemini.ts` | 1 | The `media` option, `transcribe`, the validators, and the `speak` style. |
| `features/capture/filter.ts` | 2 | The code rules and the bundler, as pure functions. |
| `features/capture/classify.ts` | 2 | The classification call. |
| `features/capture/capture.ts` | 2 | The `forget` and `capture` features. |
| `features/memories.ts` | 2 | The `memories` feature. |
| `features/invitations.ts` | 2 | The `invitations` feature. |
| `features/ask.ts` | 2b | The `ask` feature. |
| `features/echoes.ts` | 2b | The `echoes` feature (then and now). |
| `features/fastforward.ts` | 2b | The `fastforward` feature. |

### 5.3 The contract

Step 1 writes this file. A later step may add fields. A later step may not rename or remove a field without a note in its PR.

```ts
// core/types.ts
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
  send(chatId: string, message: Outgoing): Promise<{ messageId: string; voice?: Media }>;
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
  invitationVoice?: Media; // the TTS clip of invitation(moment)
  stories: Story[];
  lookbacks: string[]; // '7', '30', '365', 'anniversary-2027'
  memoryPostIds: string[];
  returns: Record<string, { count: number; due: number }>; // private returns per storyteller id
  echo?: string; // the id of the older moment that this moment echoes
  echoPostIds?: string[]; // every message of the then-and-now album, on the newer moment
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

export type Storyteller = Person & {
  started: boolean;
  lastInvitationDay?: number;
  invitation?: Invitation;
};

export type Family = {
  id: string; // the group chat id on the transport
  chatId: string; // the group chat id on the transport
  storytellers: Storyteller[];
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
  familyOfStoryteller(userId: string): Family | undefined;
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
```

### 5.4 The router and the feature order

- `route(event)` finds the family. For a group event, the router uses `event.familyId`. For a private event without `familyId`, the router uses `store.familyOfStoryteller(sender.id)`.
- The router offers the event to each feature in `FEATURES` order until a feature returns `true`.
- An unhandled private event gets `noInvitation` when the sender is a started storyteller, `notJoined` when the sender is a storyteller who is not started, and `pointer` otherwise. The router drops an unhandled group event.
- `tick(window)` calls `feature.tick(family, window, ctx)` for every family and every feature, each call in its own try/catch.

`FEATURES` in `family.service.ts` keeps this order:

| Position | Feature | Step | Handles |
| --- | --- | --- | --- |
| 1 | `intro` | 1 | `joined` and `migratedTo` events |
| 2 | `fastforward` | 2b | `/fastforward` |
| 3 | `forget` | 2 | "Anchor, forget this" and "Anchor, don't bring this back" |
| 4 | `invitations` | 2 | `/private`, `/send`, `/start`, private replies, and invitation buttons |
| 5 | `memories` | 2 | `/memory`, and replies to memory posts |
| 6 | `ask` | 2b | group messages that start with "Anchor," |
| 7 | `capture` | 2 | every other group message, and the bundle close on each tick |
| 8 | `echoes` | 2b | no events; its tick runs after the capture tick |

### 5.5 The host

`FamilyService` in `family.service.ts` is a Nest provider in `AppModule`.

- When `TELEGRAM_BOT_TOKEN` is unset, the host does nothing: no store, no tick, and no poll. The Vercel deploy of `anchor-api` never sets the token, because a serverless function cannot hold a poll or a tick.
- When the token is set, the host loads the store on application bootstrap and builds the context.
- The host starts a 2-second interval. Each run computes the demo-clock window since the previous run and calls `tick(window)`.
- The host starts the Telegram poll. Each update goes through `toIncoming` and then `route`.
- `ctx.transport(familyId)` returns the Telegram transport. A later transport adds its own family id prefix here.
- On application shutdown, the host stops the interval and the poll.

### 5.6 Environment variables

Step 1 adds these lines to `apps/api/.env.example`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | unset | The token from BotFather. When the variable is unset, the host starts no poll. |
| `ANCHOR_DAY_SECONDS` | `86400` | The real seconds in one demo-clock day. The team test uses 120 or 600. |
| `ANCHOR_STATE_FILE` | `tmp/anchor-state.json` | The JSON file of the record. `tmp/` is in `.gitignore`. |
| `TZ` | the host zone | The zone of the 11:00 and 18:00 slots. |

### 5.7 The prototype and the website

Every file on `main` stays untouched, except `app.module.ts`, `gemini.ts`, `apps/api/.env.example`, `apps/api/Dockerfile`, and `DEPLOY.md`. Those five files change in additive ways only.

The website, the prototype engine, the auth, the file routes, and the Vercel deploy of `anchor-api` keep working. Vercel builds the website from `main`, so no step may break the web build.

## 6. Gemini calls

### 6.1 Shared rules

- The model seam: every feature calls only the exports of `model/model.ts`, which are `ask`, `transcribe`, `speak`, and `valid`. Every test mocks that module. The prototype imports the seam through the re-export in `gemini.ts`, and the re-export goes with the prototype.
- The providers: `model/provider.ts` defines the provider interface. `model/openai.ts` is the only file that knows OpenAI, and `model/gemini.ts` is the only file that knows Gemini. `ANCHOR_MODEL_PROVIDER` selects the provider, and the default is `openai`.
- The seam contract: `ask<T>(prompt, schema, { audio?, media?, fast?, timeoutMs? })` returns JSON that matches the schema, and `media` holds images and audio clips. `transcribe(clip)` returns a transcript or an empty string. `speak(text, style?)` returns WAV, which `transports/voice.ts` converts for Telegram.
- Every provider returns WAV from `speak`, because `transports/voice.ts` converts WAV only. A voice note in another format falls back to text.
- `ask` gets a `media` option, a list of `{ data, mimeType }`, next to the `audio` option that the prototype uses. An `image/*` item becomes an image input, and an `audio/*` item becomes an audio input.
- In the Gemini provider, the input items are `{ type: 'image', data, mime_type }` and `{ type: 'audio', data, mime_type }`, with base64 data (ai.google.dev/api/interactions-api).
- The disk cache has one directory per provider, and the cache key includes a hash of every media item. A switch of provider never serves a cached answer of the other provider.
- UNVERIFIED: the Interactions API docs do not confirm `enum`, `minimum`, or `maximum` in a response schema. The validators enforce every rule in code.
- Every result passes a validator before the code uses it. Section 8 lists each fallback.
- The prompts describe Anchor as the keeper of the family's record. No prompt mentions memory loss.

### 6.2 Classify a bundle (step 2)

| Field | Type | Rule |
| --- | --- | --- |
| `verdict` | enum | `family_moment`, `sensitive`, `logistics`, or `small_talk`. |
| `salience` | integer | 1 to 5. An invalid value becomes 3. |
| `people` | string array | The names in the moment. An invalid value becomes an empty array. |
| `eventDate` | string | `YYYY-MM-DD`, or an empty string when the date is unknown. An invalid value becomes unknown. |
| `title` | string | A short phrase that names what the moment shows, for example "Maria's first day at school". It never names the sharer and never starts with "Photo of". At most 100 characters. |
| `transcript` | string | The words spoken in the voice note of the bundle, or an empty string. |

- `family_moment` is a moment worth keeping.
- `sensitive` is a moment worth keeping that can hurt to see again: a loss, grief, or illness.
- `logistics` covers plans, errands, and money. `small_talk` covers chatter, jokes, reactions, and arguments.
- A `family_moment` or a `sensitive` moment with an empty `title` counts as `failed`.
- The code composes every line that quotes a moment, from `moment.text` and the sender's name. Gemini writes no line that Anchor sends.

### 6.3 Transcribe and read a reply

- `transcribe(media)` (step 1) returns the transcript of a voice note, or an empty string. The schema is `{ transcript: string }`, and the call uses the fast models. Group voice stories use this call.
- The reply call (step 2, in `features/invitations.ts`) reads one private reply, text or voice, next to the moment's title and the sender's words. The schema is `{ transcript: string, kind: story | unsure | question | other }`.
- A text reply of at most 4 words that ends with "?" is decided in code, with no model call. It is `question` when it starts with who, what, where, when, which, or why, and `unsure` otherwise, so "a school?" always gets the gentle help. Voice replies and longer texts go to the model.
- The kinds are `story | unsure | question | other`. `story` is a detail, a feeling, or a memory. `unsure` is a hesitation, for example "a school?". `question` asks what the moment is, for example "who is that?". `other` is an acknowledgement, for example "ok" or an emoji.

### 6.4 Find a moment (step 2b)

- The prompt holds the question and one line per moment: id, title, date, people, and the first 200 characters of each story.
- The schema is `{ momentId: enum }`, with the moment ids of the family and `none`.
- A voice question goes in as audio in the same call. A voice question needs a caption that starts with "Anchor,". A spoken "Anchor, …" without a caption goes to capture, because detecting it would cost one transcription per group voice note.

### 6.5 Speak (existing)

- `speak(text, style?)` keeps its models and its cache, and gets an optional style. The prototype keeps the default style.
- The bot passes the style "warm, calm and slow, like a kind family friend talking to a grandparent".

### 6.6 Find an echo (step 2b)

- The prompt holds the new moment (title, text, people, and date) and one line per older moment (id, title, date, sender, and people).
- The schema is `{ momentId: enum, earlier: 'new' | 'match' }`, with the ids of the older moments that qualify and `none`. `earlier` names the moment whose life event happened first, for example the grandfather's 1958 photo that he shared after Maria's.
- An echo is the same kind of life event across the family, for example two first days at school or two weddings.
- A failed call counts as `none`.

## 7. Telegram transport (steps 1 and 1b)

- The client calls the Bot API with `httpFetch` from `http.ts`, as `gemini.ts` does, and adds no dependency.
- The poll calls `getUpdates` with a long-poll timeout and omits `allowed_updates`. `message`, `callback_query`, and `my_chat_member` arrive by default. The offset advances after each update.
- A bot that is a group admin gets every group message, whatever the privacy mode.
- `toIncoming` maps a group message, a private message, a `callback_query`, and a `my_chat_member` update that adds the bot to a group.
- In a group, a command can arrive as `/memory@<bot username>`. `toIncoming` strips the suffix when it names this bot, so the features match `/memory`, `/send`, `/private`, and `/start` exactly. A command that names another bot stays as it is.
- `toIncoming` maps `message.video` to `video`, and the video's `thumbnail` to `thumbnail`. A `video_note` maps to `unsupported`.
- `toIncoming` maps a message that carries `migrate_to_chat_id` to an event with `migratedTo`. `intro` then moves the family to the new chat id. A basic group can become a supergroup, for example when a member promotes Anchor to admin.
- `album` goes out through `sendMediaGroup`. `mention` becomes a `text_mention` entity, with offsets in UTF-16 code units. `react` with `big` sets `is_big`.
- `send` uses `sendMessage`, `sendPhoto`, `sendVideo`, or `sendVoice`, with `reply_parameters: { message_id }` for a reply. A caption holds at most 1024 characters. A video goes out by its `file_id`, so the 20 MB download limit never applies to it.
- A `{ wav }` voice goes through `voice.ts`, which runs `ffmpeg -f wav -i pipe:0 -c:a libopus -b:a 32k -f ogg pipe:1`. The OGG file uploads as multipart form data, and the result returns the new `file_id` as the voice media id.
- A `file_id` belongs to the bot, not to a chat. The bot can resend a voice note from the group in a private chat, and the reverse.
- `react` uses `setMessageReaction` with `{ type: 'emoji', emoji }`. The allowed list holds ❤ as U+2764 without U+FE0F, and it holds 👌.
- `download` uses `getFile` and `https://api.telegram.org/file/bot<token>/<file_path>`. A bot downloads files of at most 20 MB.
- `isAdmin` uses `getChatMember`. The statuses `creator` and `administrator` mean an admin.
- `startLink` returns `https://t.me/<bot username>?start=<payload>`, with the username from `getMe`. The payload holds at most 64 characters from `A-Z`, `a-z`, `0-9`, `_`, and `-`.
- Button data holds 1 to 64 bytes. A URL button works in a group and in a private chat.
- Each button sits in its own `inline_keyboard` row, so an older reader gets large tap targets.
- A callback query always gets `answerCallbackQuery`, also when no feature acts on the query.
- Only one process may poll one token. Each developer creates a dev bot in BotFather for local work.

BotFather setup for the team test:

1. Send `/newbot` to BotFather and copy the token into `apps/api/.env.local`.
2. Send `/setprivacy` to BotFather, choose the bot, and choose Disable.
3. Add the bot to the test group, and promote the bot to admin.

## 8. Error handling

- **Gemini**: every call has a fixed fallback.
  - A failed or invalid classification drops the bundle and increments `failed`. Nothing unclassified enters the record, because the sensitive check did not run.
  - A failed transcription keeps the voice note with the text `voiceNote`.
  - A failed reply call counts as `story` when the reply holds a voice note or at least 3 words, and as `other` otherwise.
  - A failed find, or a `none` answer, gets `notFound`.
  - A failed TTS call or a failed `ffmpeg` conversion sends the invitation as text.
- **Transport**: the code logs a failed send or a failed reaction, and the record change stays. When `send` throws `Blocked` for a storyteller, the code sets `started` to false.
- **Poll loop**: the loop never stops. Each update runs in its own try/catch, and the offset advances. A network error retries after 5 seconds.
- **Two pollers**: a 409 logs "another process polls this token". UNVERIFIED: the Bot API docs do not document this 409, and they say that error texts can change.
- **Races**: the tick and a reply of a storyteller can interleave around a Gemini call. After each await, a handler reads the open invitation again and stops when the invitation changed.
- **Store**: each save writes a temporary file and renames the file. When the file does not parse at boot, the store renames the file to `<name>.corrupt-<time>` and starts empty.
- **Tick**: each family and each feature runs in its own try/catch.

Known limits:

- A person is a storyteller in one family only.
- Open bundles live in memory, so a restart loses at most 2 minutes of messages.
- Cloud Storage FUSE has no concurrency control, and the last write wins. During a rollout, an old and a new instance can run for a short time, so deploy while the family is quiet.

## 9. Tests

All tests run with `pnpm nx test api` (vitest) and make no network call.

- Pure units: the clock and `slotIn`, `byPriority` and `isAnniversary`, the lookback rules, the filter rules, the bundler, the validators, the store round trip, the corrupt-file path, the router order, and `toIncoming` for each update kind.
- Features: each feature has flow tests through `FakeTransport`, with a fixed clock and `vi.mock` of `gemini.ts`.
- Voice: one test converts a generated WAV and checks the `OggS` header. The test skips when `ffmpeg` is missing.
- End to end: the checklist of step 3 in a Telegram test group.

The repository has no CI workflow. Every step runs `pnpm lint`, `pnpm typecheck`, and `pnpm nx test api` before the PR.

## 10. Steps

Each step is one session, one branch, and one PR. Each step uses TDD, then `/code-review`, `/simplify`, and `manage-pr`.

| Step | Branch | Needs | Scope | Done when |
| --- | --- | --- | --- | --- |
| 1 Foundation | `feat/family-bot-foundation` | none | `core/*`, `features/intro.ts`, `family.service.ts`, `transports/*`, the `gemini.ts` additions, `.env.example`, and the migration fix. | The bot joins a test group and posts `intro`, and a private message gets `pointer`. |
| 1b Demo contract | from the step 1 session | 1 | `Outgoing.album`, `Outgoing.mention`, `react` with `big`, `State.clockOffset`, `Moment.echo`, and the new lines of section 4.9. | Each addition has a test through `FakeTransport` and `toIncoming`. |
| 2 Memory features | `feat/family-memory-features` | 1, and 1b for the sharer change | Capture and forget, memories and stories, and invitations: sections 4.1 to 4.5, 4.7, 6.2, and the sharer change of 4.10. | The flow tests of section 9 pass for every feature. |
| 2b Demo features | `feat/family-demo-features` | 1b | `ask`, `echoes`, and `fastforward`: sections 4.6, 4.10, 6.4, and 6.6. | The flow tests of section 9 pass for the three features. |
| 3 Team test | `fix/v1-team-test` | 2 and 2b | The deploy of `anchor-bot` to Cloud Run, the team test against the live bot, the fixes, the demo script, and section 11. A second dev bot token serves the local fix loop. | The team walks the checklist and the demo script against the live bot without a blocker. |

Inside steps 2 and 2b, the features touch separate files, so subagents can build them in parallel. One session owns each file. The step 1 session owns `core/` and `transports/`, including every line in `core/lines.ts`. Steps 2 and 2b own only their feature files and their `FEATURES` lines.

A person runs `gcloud run deploy`, because the deploy costs money. The store saves only on a change, because each save on the Cloud Storage volume costs storage operations.

## 11. v1 findings

Step 3 fills this section.

## 12. Rules for every step

- Confirm that the session does not run inside another worktree before it creates one. Base the branch on `origin/main`.
- Run `pnpm install --frozen-lockfile` first. A worktree with an old `node_modules` fails `web:typecheck`.
- Run the baseline before a change: `pnpm nx test api`, `pnpm typecheck`, and `pnpm lint`. All three pass on `0c92feb`.
- Verify the current branch in the same command as each commit and each push.
- Never run two processes with the same bot token.
- Insert each feature into `FEATURES` at its position in section 5.4.
- Keep `ponytail:` comments for deliberate shortcuts, and name the ceiling in each comment.
