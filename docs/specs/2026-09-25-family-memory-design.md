# Design: Anchor, the family's memory keeper

- Date: 2026-09-25.
- Source spike: `docs/spikes/2026-09-25-family-group-chat-spike.md`, commit `b182cdf` on `main`.
- Base commit for the first steps: `0c92feb` on `main`.
- Status: sections 1 to 4 approved in the `/shape` session. The step order follows the v1 direction of the same session.
- v2: the v2 `/shape` session of 2026-09-25 approved the v2 design. The v2 spike stays outside the repository, because the repository is public. The v2 spike decisions 1 to 17 hold, with the one change in section 2. The v2 parts of this design carry a "v2" mark.
- Scope: the Telegram bot in `apps/api`. The website in `apps/web` and the prototype engine that serves the website stay untouched.

## 1. Framing

The team's journey document for Challenge #12 (older adults who live independently) sets the framing. Its persona is a grandfather who lives on his own and has a recent MCI diagnosis. His daughter shares everyday moments in the family group chat, and he has his own stories to tell.

Anchor is a member of the family group chat. Anchor keeps the family's shared moments, brings them back so the family can relive them together, and invites every member to add their stories. The design centres on the member for whom the moments are most fragile, and that makes it better for everyone.

v2: Anchor is also an accessible guide to the family for a member who feels disconnected, and a guide that leads to people. Anchor tells a disconnected member what the family shared, in the family's own words and voices. Every answer ends with a way to reach a person, for example a reply to Eleni or a voice note to the family. Accessible means voice first, no reading needed, no typing needed, and large buttons.

- Anchor is a keeper of the family's memories, never a member of the family. Anchor says that it is not a person.
- Anchor quotes each moment in the words of the person who shared it, and attributes each moment to that person. Anchor never claims feelings or a shared past of its own.
- v2: every member is equal. Each member chooses what Anchor sends them in private. The grandparents are contributors and storytellers, not receivers of help.
- v2: Anchor needs no commands. Anchor understands natural phrases, and Anchor offers a helpful action when a message implies one. Anchor must never become annoying: precision beats recall, every offer has an easy no, and an unanswered offer fades.
- The memory benefit is honest but is not the label. Only the private welcome mentions it. v2: every member gets that welcome.
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
- v2 change to the v2 spike: decision 7 lets a typed or spoken reply set the time of a reminder, for example "half past seven". That reply waits until after the demo, next to the explicit "Remind me". A reply to an ephemeral offer in the group is public, and UNVERIFIED: Telegram may not allow the reply at all. The four "Another time" buttons cover the demo.

## 3. Milestones

- **v1**: the team tests Anchor in a Telegram group, then rehearses the demo. One laptop runs the API with long polling, so the first test needs no deploy. Steps 1, 1b, 2, 2b, and 3 build v1, including Ask Anchor and the demo additions of section 4.10.
- **v1.x**: the changes that the v1 findings ask for.
- **v2**: every member joins with one tap and chooses what Anchor sends them. Natural phrases replace the commands. Anchor makes share offers and reminder offers. Voice goes both ways as voice notes. The phone call is the stretch goal: the call joins the demo only when the call rings a demo phone by Saturday night. Steps 4 to 8 build v2 (section 10).
- **After the demo**: story prompts, catch-up offers, "Tell the family", the explicit "Remind me", and the typed or spoken reminder time.

Step 3 writes the v1 findings into section 11. Read section 11 before a v1.x change starts.

## 4. Behaviour

### 4.1 Members (v2)

v2 replaces the storyteller role of v1. Section 4.11 holds the join flow and the choices.

- A member is any person who wrote in the group or tapped Start. `family.members` holds every member, and every member is equal.
- A member taps Start once. Telegram lets a bot write in a private chat only after that tap. `member.started` records the tap.
- A member gets family moments in private only after the member turns on the "Family moments" choice.
- v1 called a member a storyteller. `/private` and `/send` go away in v2.

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

Moments come back to a member more often than to the group, in private, at 11:00. Each return is an invitation to relive the moment.

v2: this section says storyteller for a member who has `started` and `choices.moments`. The rules stay the same, except for the `/send` rules at the end of the section.

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
- v2 removes `/send`. Two paths send an invitation at once, and an open invitation closes first:
  - The `sendMe` intent (section 4.6) sends one invitation to the member who asked. Anchor picks the moment with the lowest return count, and `byPriority` breaks a tie. When no moment qualifies, the member gets `nothingNew` in private.
  - A share offer (section 4.12) sends its one moment to each recipient.
- Both paths skip the 3-hour rule and the due check. Each delivered invitation sets `member.seenAt` to the `savedAt` of the moment when that value is newer.
- `invitations.ts` exports `shareStory(family, person, moment, story, ctx)`. `shareStory` posts `storyAdded`, reacts with a big ❤, posts the voice note, and appends the story. The call (section 4.15) uses `shareStory` too.

### 4.6 Ask Anchor and the intent router (steps 2b and 5)

- A group message that matches `/^anchor\b[,:]?\s+/i` is a question. The `forget` feature runs first, so "Anchor, forget this" never reaches `ask`.
- One Gemini call picks one moment id from an enum of the ids of the family, or `none` (section 6.4). The enum leaves out every sensitive moment.
- Anchor replies to the question with the video or the photo and the caption `askAnswer(title, date, names)`. The first voice story follows by its media id.
- `none`, or a failed call, gets `notFound`.

v2: the `intents` feature takes the position of `ask` and reads every phrase. No member learns a fixed phrase.

- `intents` reads each group message that matches the ask pattern. `intents` also reads each private message that no earlier feature owns. An open invitation still owns the replies to the invitation (section 4.5).
- In the private chat, no "Anchor" prefix is needed. A private voice note goes to the model as audio.
- One model call returns `{ intent, momentId }` (section 6.7). The code acts on the intent:

| Intent | Group | Private |
| --- | --- | --- |
| `memory` | Posts a group memory now, like `/memory`. `/memory` stays. | Acts like `sendMe`. |
| `find` | Ask Anchor with the `momentId` of the same call. | Sends the moment of `momentId` in private, with `askAnswer`. |
| `sendMe` | Sends an invitation in private when the member started. Otherwise sends the member the ephemeral `nudge`. | Sends an invitation now (section 4.5). |
| `missed` | Acts like `sendMe`. | Sends up to 3 moments with a `savedAt` after `member.seenAt`, with `missed(count)` first. With no such moment, sends `nothingNew`. |
| `settings` | Sends the member the ephemeral `nudge`. | Sends the choices screen (section 4.11). |
| `stop` | Sends the member the ephemeral `nudge`. | Acts like the word "stop" (section 4.7). |
| `callMe` | Acts like the private intent when the member started. | Calls `callMember` (section 4.15). A `false` result gets `callFailed`. |
| `forget`, `quiet` | Acts like "Anchor, forget this" or "Anchor, don't bring this back" on the replied-to message. | Acts like `unclear`. |
| `unclear` | Replies `unclear` with the group next-step buttons. | Sends `unclear` with the private next-step buttons. |

- The `forget` feature still runs first with its exact patterns. `intents` handles the looser wordings through a function that `capture.ts` exports.
- `missed` with no `seenAt` counts the moments of the last 7 demo-clock days.
- Next-step buttons: every private answer ends with 2 or 3 buttons for the likely next step. The code picks the buttons, never the model. The button data starts with `nxt:`, and a tap acts like the intent of the button.
  - Private next steps: "Another moment" (`sendMe`), "What did I miss?" (`missed`), "My settings" (`settings`), and "Call me" (`callMe`) when the member has `choices.call`.
  - Group next steps: "Show us a memory" (`memory`), and the URL button "Choose what I send you".
- A failed call, or an invalid intent, counts as `unclear`. No message gets an error.

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
- `/private` that replies to no person, or to Anchor's own message, gets `privateHow`. `/send` with no started storyteller gets `nobodyPrivate`. No command fails in silence.
- The bot registers a "/" menu with `setMyCommands`. In a group, every member sees `/memory`, and only admins see `/private`, `/send`, and `/fastforward`. In a private chat, everyone sees `/start` and `/stop`. The descriptions live in `core/lines.ts`.
- A private message that no feature handles gets `noInvitation` from a started storyteller, and `notJoined` from a storyteller who has not said yes or who stopped. Any other person gets `pointer`.

v2 changes to this section:

- `/private`, `/send`, `adminOnly` for those two commands, `privateHow`, `nobodyPrivate`, and `storytellerStart` go away.
- `intro` carries the URL button "Choose what I send you" to `transport.startLink(family id)`.
- `/start` with any payload belongs to the `members` feature (section 4.11). "Yes, I'd like that" and "Not now" go away, because the choices screen replaces them.
- `/stop`, or the single word "stop" in private, turns every choice off, sets `started` to false as in v1, closes the open invitation silently, and sends `stopped`. Anchor still answers the private messages of the member. A tap on Start starts the member again. The demo resets the grandfather with "stop" before each rehearsal.
- The "/" menu: in a group, every member sees `/memory`, and only admins see `/memory` and `/fastforward`. `/fastforward` is an ephemeral command (`is_ephemeral`), so only the presenter sees the command. In a private chat, everyone sees `/start` and `/stop`.
- The router fallback: `intents` handles every private message of a member, so only a person with no family gets `pointer`. `noInvitation` and `notJoined` go away.

### 4.8 Clock

- `now()` returns the demo-clock time: `clockStart + (realNow - clockStart) * 86400 / ANCHOR_DAY_SECONDS + clockOffset`.
- The store sets `State.clockStart` once, at the first boot, so a restart keeps the timeline.
- The slots use local time. Set `TZ=Europe/Athens` when the host runs in UTC.
- v2: `ctx.restartWindow()` makes the next tick window start at the current demo-clock time. The window is then empty, so no slot inside a clock jump fires. A due reminder still fires, because the reminder rule is `due <= window.to` (section 4.13).

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
| `privateHow` | Reply /private to a message from the person who should get family moments in private. |
| `nobodyPrivate` | Nobody gets family moments in private yet. Reply /private to a grandparent's message first. |
| `notJoined` | Thank you 🙂 If you'd like family moments from me, send /start. |
| `forgetWhich` | This post shows two moments. Which one should I forget? (one button per moment) |
| `quietWhich` | This post shows two moments. Which one should I stop bringing back? (one button per moment) |
| `voiceNote` | 🎤 voice note |
| `nothingToShare` | The family record is empty so far. Share a photo with a few words 🙂 |
| `nothingToInvite(name)` | {name} has seen every moment so far. |

The buttons read "Start", "Yes, I'd like that", "Not now", "Don't bring this back", "What is this?", "Yes, share it", and "No, thanks".

`invitation`, `memoryCaption`, and `storyAdded` clip the quoted text to 600 characters, and `echoCaption` clips each of its two quotes to 450 characters. Each clip ends with "…". Every caption then stays under the Telegram limit of 1024 characters, and the invitation voice note stays short. The step 1 session writes every line. A feature step asks that session for a wording change, and no line may break section 1.

v2 lines. Step 4 writes the lines of steps 6 and 7. Step 5 writes the lines of step 5. After step 4, step 5 owns `core/lines.ts`, and steps 6 and 7 ask the orchestrator for a wording change.

| Key | Written in step | Text |
| --- | --- | --- |
| `intro` | 5 | The v1 text, with "An admin can reply /private to a grandparent's message, and I'll send them family moments in private." replaced by "Tap the button to choose what I send you in private." |
| `nudge(name)` | 5 | {name}, I can send you family moments, reminders, and voice notes in private. Tap to choose 🙂 |
| `welcome(name)` | 5 | Hello {name} 🙂 I'm Anchor. I'm not a person: I keep your family's photos and stories. I can send you family moments now and then, remind you of things, and talk to you by voice. Seeing moments again helps them stay with us. Tap what you'd like. You can change it at any time: just say "settings". |
| `choice(on, label)` | 5 | ✅ {label} when on, ⬜ {label} when off |
| `choicesSaved(names)` | 5 | All set 💛 You get: {names}. With no names: All set. I won't send you anything for now. Say "settings" to change this. |
| `askPhone` | 5 | To call you, I need your phone number. Tap the button below to share it 🙂 |
| `phoneSaved` | 5 | Thank you 💛 I call from this number, so you know it's me. |
| `stopped` | 5 | Of course. I won't send you anything more. If you'd like moments again, say "settings". |
| `shareOffer(names)` | 5 | Shall I send this to {names} now? |
| `shareSent(names)` | 5 | Sent to {names} 💛 |
| `offersOff` | 5 | Of course. I won't offer that again. Say "settings" to change this. |
| `unclear` | 5 | I'm not sure I understood 🙂 Here is what I can do: |
| `missed(count)` | 5 | The family shared {count} moments since we last talked 💛 |
| `nothingNew` | 5 | You're up to date 💛 Nothing new since we last talked. |
| `calling` | 5 | I'm ringing you now 📞 |
| `callFailed` | 5 | I couldn't ring you just now. Shall I send you a moment here instead? |
| `reminderOffer(who, text)` | 4 | ⏰ {who} wrote: «{text}» (new line) Shall I remind you? {who} is "You" when the sender gets the reminder. |
| `reminderSet(time)` | 4 | Done ✍ I'll remind you at {time} in our private chat. |
| `reminderStart(time)` | 4 | Tap Start, and I'll remind you at {time} in our private chat 🙂 |
| `reminderConfirmed(time)` | 4 | Done ✍ I'll remind you here at {time}. |
| `reminder(who, text)` | 4 | ⏰ Your reminder. {who} wrote: «{text}» |
| `fastforwardUsage` | 4 | Send /fastforward and a number of days or a time, for example /fastforward 7 or /fastforward 08:05. |
| `call.opening(name)` | 4 | Hello {name}, this is Anchor, the family's record keeper. I'm not a person. |
| `call.askShare` | 4 | Shall I share what you told me with the family? |
| `call.reachPerson(sender)` | 4 | Shall I tell {sender} you'd love a call? |
| `call.goodbye(name)` | 4 | Thank you, {name}. Goodbye 💛 |
| `wouldLoveCall(name, sender)` | 4 | {sender}, {name} would love a call from you 💛 |

The v2 buttons read "Choose what I send you", "Family moments now and then", "Reminders when I need them", "Offers to send my moments to the family", "Talk to me by voice", "Call me on the phone", "Done", "Share my phone number", "Yes, send it", "No thanks", "Stop offering this", "Yes, at {time}", "Another time", "Stop offering reminders", "Another moment", "What did I miss?", "My settings", "Call me", and "Show us a memory". `reminderOffer` and `reminder` clip the quoted text to 600 characters. Each call line follows section 1, and `call.opening` always opens a call.

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
- **Stage time travel to a clock time** (v2, step 6): `/fastforward HH:MM` jumps the family clock to the next local `HH:MM` after now. The feature adds the difference to `State.clockOffset`, saves, and calls `ctx.restartWindow()`. The 11:00 and 18:00 slots inside the jump stay quiet, and a due reminder fires on the next tick. The reply goes out with `onlyFor` the presenter, so the family never sees it. The clock is global, so a rehearsal on the live bot moves the clock of every family forward.
- **The demo script** (step 3): the team test ends with a written 3-minute script that walks journey steps 1 to 6, and the team rehearses the script twice.
- **The v2 demo script** (step 8): the v2 cues are one-tap joining, a share offer, a reminder offer with `/fastforward 08:05`, voice notes both ways, and the call as the stretch goal.

### 4.11 Joining and choices (v2, step 5)

- `store.joinMember(family, person)` returns the member, and adds a member with the default choices when the person is new.
- Join nudge: the first group message of a member who has not started gets one ephemeral `nudge(name)`, with the URL button "Choose what I send you" to `startLink(family id)`. The code sets `member.nudged` before the send, so a failed send never repeats the nudge. Nobody else sees the nudge.
- `/start <payload>` in private sets `started` and sends `welcome(name)` with the choices screen. The payload is the family id or `r_<reminder id>` (section 4.13). The payload finds the family also for a person who is not a member yet.
- `/start` without a payload, from a member, sends the choices screen. From a person with no family, `/start` gets `pointer`.
- The choices screen holds one toggle button per choice, each in its own row, and "Done". A toggle label is `choice(on, label)`. A tap flips the choice, saves, and edits the buttons of the same message in place.

| Choice | Button | Default | Effect |
| --- | --- | --- | --- |
| `moments` | Family moments now and then | off | The 11:00 invitations and the share offers to this member. Nothing comes in private unasked before this yes, as in v1. A moment that the member asks for (`sendMe`, `find`, `missed`) needs no choice. |
| `reminders` | Reminders when I need them | on | Reminder offers to this member. Each offer still needs a tap. |
| `shares` | Offers to send my moments to the family | on | Share offers to this member. |
| `voice` | Talk to me by voice | off | Every private line goes out as a voice note (section 4.14). |
| `call` | Call me on the phone | off | Calls to this member (section 4.15). The button shows only when `TWILIO_FROM` is set. |

- A tap that turns on `call` without `member.phone` sends `askPhone` with the reply-keyboard button "Share my phone number" (`Button.contact`). A contact of the member's own Telegram user sets `member.phone` in E.164. Then Anchor sends `phoneSaved` and a contact card of Anchor with the number of `TWILIO_FROM`. A contact of another user changes nothing.
- "Done" sends `choicesSaved(names)` with the private next-step buttons.
- A member of v1 keeps `started`, and gets `choices.moments` from the v1 `started` value.

### 4.12 Share offers (v2, step 5)

- The `shares` tick checks each moment that `capture` saved inside the tick window. The moment must not be sensitive, and the sender must have `choices.shares`.
- The recipients are the members with `started` and `choices.moments`, except the sender. With no recipient, Anchor makes no offer.
- Anchor sends the sender an ephemeral `shareOffer(names)` with the buttons "Yes, send it", "No thanks", and "Stop offering this". Nobody else sees the offer.
- "Yes, send it" sends the moment at once to each recipient as an invitation (section 4.5), and edits the offer to `shareSent(names)`.
- "No thanks" removes the offer. "Stop offering this" sets `choices.shares` to false and edits the offer to `offersOff`.
- An unanswered offer fades after 10 demo-clock minutes (section 4.13) and never comes back.

### 4.13 Reminder offers and reminders (v2, step 6)

The `reminders` feature reads a group message before `capture`, and returns `false`, so `capture` still sees the message. A reminder never enters the family record, so memories, Ask Anchor, and then and now never see a reminder.

- The gate: a group text or caption that does not match the ask pattern, and that matches the code word filter. The filter matches remember, don't forget, remind, a clock time, "when we leave", "in the morning", "tonight", and "tomorrow". A voice note never passes the gate, because a gate on voice costs one transcription per group voice note.
- The offer call (section 6.8) returns `{ offer, who, time }`. `offer` is false by default. `who` is a member id or `unknown`, and `unknown` goes to the sender.
- The recipient must have `choices.reminders`. Anchor sends the recipient an ephemeral `reminderOffer(who, text)` that quotes the sender's words. The buttons are "Yes, at {time}", "Another time", "No thanks", and "Stop offering reminders".
- An empty `time` shows four times instead of "Yes, at {time}": 08:00, 12:00, 18:00, and 21:00.
- "Another time" swaps the buttons in place for four times around the suggestion (one hour before, 30 minutes before, 30 minutes after, and one hour after), and "No thanks".
- A time tap from a member who started sets `due` to the next local `time`, sets `status` to `set`, edits the offer to `reminderSet(time)`, and reacts with ✍ on the sender's message.
- A time tap from a member who never started sets `status` to `waiting`, and edits the offer to `reminderStart(time)` with a Start button to `startLink('r_' + reminder id)`. `/start r_<id>` sets `due` and `status` to `set`, sends `reminderConfirmed(time)`, and reacts with ✍. The `members` feature then sends the welcome.
- "No thanks" removes the offer and the reminder. "Stop offering reminders" sets `choices.reminders` to false, and edits the offer to `offersOff`.
- Delivery: each tick sends every reminder with `status` `set` and `due <= window.to` to its member in private, with `reminder(who, text)` through `tell` (section 4.14). The code sets `status` to `sent` and `sentAt`.
- The sender and the family see only the ✍ reaction. The reminder text shows to the recipient only.
- Fading: `core/offers.ts` removes each unanswered offer 10 demo-clock minutes after the send, for share offers and reminder offers. A faded reminder offer deletes its reminder when the `status` is `offered` or `waiting`.
- A tap on an offer that faded or closed removes the tapped message, and changes nothing.

### 4.14 Voice both ways (v2, step 5)

- `core/tell.ts` sends every private line of every feature. `tell` handles `Blocked` as section 8 describes.
- When the member has `choices.voice`, `tell` turns a text line into a voice note: `speak(text, VOICE_STYLE)`, with the text as the caption and the same buttons. A line with a photo, a video, a voice note, an album, or a contact goes out as it is. A failed TTS call or a failed conversion sends the text.
- Group lines and ephemeral offers stay text.
- A private voice note of a member goes to the model as audio: to the reply call when an invitation is open (section 6.3), and to the intent call otherwise (section 6.7).
- The invitation keeps its v1 voice note for every member (section 4.5).

### 4.15 The phone call (v2, step 7, the stretch goal)

Twilio places the call, and OpenAI Realtime is the voice. The call runs through Twilio Media Streams and a bridge in `call/`, because the server must see the audio to cut the member's voice note.

- `features/calls.ts` exports `callMember(family, member, ctx, reminder?)`, which returns `false` when Anchor cannot ring the member. Step 4 lands a stub that always returns `false`.
- Step 7 builds the call in this order, and stops wherever Saturday night ends:
  1. "Anchor, call me" (`callMe`): Anchor sends `calling`, rings `member.phone`, and talks about the newest moment that the member did not send.
  2. The share: on the member's yes, `shareStory` posts the member's words and a voice note cut from the member's side of the call.
  3. The reminder call: the `calls` tick rings a member with `choices.call` for each reminder with a `sentAt` inside the window. The private reminder still arrives.
  4. The daily call: at the 11:00 slot, at most once a day (`member.lastCallDay`), and only when the family shared a moment since the last call.
  5. Calls to Anchor's number: the member rings Anchor. This part changes the voice URL of the Twilio number, and needs the user's go first.
- The call opens with `call.opening(name)`. Anchor quotes the moment with `invitation(moment)`, listens, and asks at most one short follow-up.
- The call asks `call.askShare` before the end. Without a yes, Anchor keeps no audio and no transcript of the call.
- The call ends with a way to reach a person: `call.reachPerson(sender)`. A yes posts `wouldLoveCall(name, sender)` in the group, with a mention of the sender. Then `call.goodbye(name)`, and Anchor hangs up.
- A goodbye from the member also ends the call. A call lasts at most 10 minutes.
- Ingress: the Nest HTTP server upgrades `/call/stream` to a WebSocket. The inline TwiML passes a random token per call as a stream `<Parameter>`. The bridge drops a stream whose token Anchor did not issue. A webhook for calls to Anchor's number checks the Twilio signature.
- The demo gate: the call joins the demo script only when the call rings a demo phone by Saturday night, through the deployed bot.

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

v2 files and owners. Step 4 creates each new file, as a stub where the table says so. After step 4, the owner of a file is the only step that changes the file.

| Path | Owner | Purpose |
| --- | --- | --- |
| `core/types.ts`, `core/store.ts`, `core/router.ts`, `core/lines.ts`, `core/fake-transport.ts`, `core/clock.ts`, `core/priority.ts` | 5 | The contract in section 5.3, `joinMember`, the router, and every line. |
| `core/tell.ts` | 5 | Every private send (section 4.14). Step 4 lands the text path. |
| `core/offers.ts` | 6 | `sendOffer`, `findOffer`, `closeOffer`, and `fadeOffers` for both kinds of offer. Step 4 lands the full file. |
| `transports/*` | 5 | The v2 Telegram additions of section 7. |
| `features/members.ts` | 5 | The `members` feature: `/start`, the choices, the phone number, "stop", and the join nudge. Step 4 lands a stub. |
| `features/intents.ts` | 5 | The `intents` feature (section 4.6). Step 4 lands a stub that runs `ask`. |
| `features/shares.ts` | 5 | The `shares` feature (section 4.12). Step 4 lands a stub. |
| `features/ask.ts`, `features/invitations.ts`, `features/memories.ts`, `features/capture/*`, `features/intro.ts`, `demo-flow.test.ts` | 5 | The v1 features, and the v2 changes of sections 4.5 to 4.7. |
| `features/reminders/*` | 6 | The `reminders` feature (section 4.13). Step 4 lands a stub in `features/reminders/reminders.ts`. |
| `features/fastforward.ts` | 6 | `/fastforward HH:MM` (section 4.10). |
| `call/*` | 7 | The Media Streams bridge to OpenAI Realtime, and the audio capture. |
| `features/calls.ts` | 7 | The `calls` feature and `callMember` (section 4.15). Step 4 lands a stub. |
| `main.ts`, `DEPLOY.md`, `scripts/deploy-bot.sh` | 7 | The WebSocket upgrade, the public ingress, and the deploy notes. |
| `family.service.ts`, `apps/api/.env.example` | 4 | The final `FEATURES` order, `restartWindow`, and every v2 variable. No later step changes these files. |

Each owner also owns the test file next to each owned file.

### 5.3 The contract

Step 1 writes this file. A later step may add fields. A later step may not rename or remove a field without a note in its PR.

v2: step 4 renames `Storyteller` to `Member`, `family.storytellers` to `family.members`, and `familyOfStoryteller` to `familyOfMember`. The block below shows the contract after step 4. After step 4, a step that needs a new field asks the orchestrator, and step 5 adds the field.

```ts
// core/types.ts
export type Media = { id: string; mimeType?: string };

export type Button = { label: string; data?: string; url?: string; contact?: boolean }; // v2 contact: a private reply-keyboard button that shares the member's phone number

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
  ephemeral?: boolean; // v2: an ephemeral command, or a tap on an ephemeral message; messageId holds the ephemeral message id
  contact?: { phone: string; userId?: string }; // v2: a shared contact; userId is set when the contact is a Telegram user
};

export type Outgoing = {
  text?: string; // the caption when photo or voice is set
  photo?: Media; // set at most one of photo, video, voice, album, and contact
  video?: Media;
  voice?: Media | { wav: Buffer };
  album?: Array<{ photo: Media } | { video: Media }>; // the caption goes on the first item; no buttons
  contact?: { phone: string; name: string }; // v2: a contact card
  mention?: Person; // mentions the first occurrence of the name in the text
  buttons?: Button[]; // a contact button goes alone, as a reply keyboard
  replyTo?: string;
  onlyFor?: string; // v2: the user id of the only member who sees this group message (an ephemeral message); no replyTo
};

export class Blocked extends Error {} // send throws Blocked when the person blocked Anchor

export interface Transport {
  send(chatId: string, message: Outgoing): Promise<{ messageId: string; messageIds?: string[]; voice?: Media }>; // messageIds: every message of an album
  edit(chatId: string, messageId: string, change: { text?: string; buttons?: Button[]; onlyFor?: string }): Promise<void>; // v2: text replaces the text of a text message; buttons alone replace the buttons of any message
  remove(chatId: string, messageId: string, onlyFor?: string): Promise<void>; // v2
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
  returns: Record<string, { count: number; due: number }>; // private returns per member id
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

export type Choices = { moments: boolean; reminders: boolean; shares: boolean; voice: boolean; call: boolean }; // v2, section 4.11

export type Member = Person & {
  started: boolean; // the member tapped Start, so Anchor can write in private
  choices: Choices; // v2
  nudged?: boolean; // v2: the one join nudge went out
  phone?: string; // v2: E.164, from the one-tap contact share
  seenAt?: number; // v2: demo-clock ms, the newest savedAt that Anchor sent in private
  lastCallDay?: number; // v2: the demo-clock day index of the last daily call
  lastInvitationDay?: number;
  invitation?: Invitation;
};

export type Offer = { // v2, sections 4.12 and 4.13
  id: string; // 8 characters, in the button data
  kind: 'share' | 'reminder';
  to: string; // the member id; the offer is an ephemeral message for this member
  messageId: string; // the ephemeral message id
  at: number; // demo-clock ms of the send
  ref: string; // the moment id of a share offer, or the reminder id of a reminder offer
};

export type Reminder = { // v2, section 4.13
  id: string; // 8 characters, in the button data and the start payload
  to: string; // the member id who gets the reminder
  from: Person; // the sender of the source message
  text: string; // the sender's words, verbatim
  sourceId: string; // the group message that gets the ✍ reaction
  time: string; // HH:MM, the suggestion, then the time that the member picked
  due?: number; // demo-clock ms, set with status 'set'
  status: 'offered' | 'waiting' | 'set' | 'sent'; // waiting: the member picked a time and has not tapped Start
  sentAt?: number; // demo-clock ms of the delivery
};

export type Family = {
  id: string; // the group chat id on the transport
  chatId: string; // the group chat id on the transport
  members: Member[]; // v2: renamed from storytellers
  moments: Moment[];
  offers: Offer[]; // v2
  reminders: Reminder[]; // v2
  lastMemoryDay?: number;
  counters: Record<string, number>;
};

export type State = { clockStart: number; clockOffset: number; families: Family[] }; // clockOffset in ms, set by /fastforward

export type Window = { from: number; to: number }; // demo-clock ms

export interface Store {
  readonly state: State;
  family(id: string): Family | undefined;
  addFamily(id: string, chatId: string): Family;
  familyOfMember(userId: string): Family | undefined; // v2: renamed from familyOfStoryteller
  joinMember(family: Family, person: Person): Member; // v2: adds a member with the default choices when the person is new
  save(): void;
}

export type Context = {
  now(): number; // demo-clock ms
  store: Store;
  transport(familyId: string): Transport;
  restartWindow?(): void; // v2: the next tick window starts at now, so no slot inside a clock jump fires
};

export interface Feature {
  name: string;
  handle?(event: Incoming, family: Family | undefined, ctx: Context): Promise<boolean>;
  tick?(family: Family, window: Window, ctx: Context): Promise<void>;
}
```

v2 shared functions. Step 4 lands each signature.

```ts
// core/offers.ts: every ephemeral offer goes through these functions
export const FADE_MS = 10 * 60_000;
export function sendOffer(family: Family, kind: Offer['kind'], to: Member, ref: string, message: Outgoing, ctx: Context): Promise<Offer | undefined>; // sends with onlyFor, records the offer, saves; undefined when the send fails
export function findOffer(family: Family, id: string): Offer | undefined;
export function closeOffer(family: Family, offer: Offer, ctx: Context, change?: { text?: string; buttons?: Button[] }): Promise<void>; // edits the offer to the change, or removes the offer without a change; drops the record; saves
export function fadeOffers(family: Family, kind: Offer['kind'], now: number, ctx: Context): Promise<Offer[]>; // removes each offer older than FADE_MS, drops the records, saves, and returns the faded offers

// core/tell.ts: every private line goes through tell
export function tell(family: Family, member: Member, message: Outgoing, ctx: Context): Promise<{ messageId: string; voice?: Media } | undefined>; // Blocked sets started to false; another error logs; both return undefined

// features/invitations.ts
export function shareStory(family: Family, person: Person, moment: Moment, story: { text: string; voice?: Media }, ctx: Context): Promise<void>;

// features/calls.ts
export function callMember(family: Family, member: Member, ctx: Context, reminder?: Reminder): Promise<boolean>; // false when Anchor cannot ring the member
```

### 5.4 The router and the feature order

- `route(event)` finds the family. For a group event, the router uses `event.familyId`. For a private event without `familyId`, the router uses `store.familyOfStoryteller(sender.id)`. v2: `store.familyOfMember(sender.id)`. For a `/start <payload>` from a person who is not a member yet, the `members` feature and the `reminders` feature find the family from the payload.
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

v2: step 4 writes this `FEATURES` order, and no later step changes the order:

| Position | Feature | Owner | Handles |
| --- | --- | --- | --- |
| 1 | `intro` | 5 | `joined` and `migratedTo` events |
| 2 | `fastforward` | 6 | `/fastforward` |
| 3 | `forget` | 5 | the exact forget and keep-quiet patterns, and their buttons |
| 4 | `reminders` | 6 | `/start r_<id>`, the `rem:` buttons, and the gate on group messages (returns `false`); its tick delivers and fades |
| 5 | `members` | 5 | `/start`, the `set:` buttons, a contact, "stop", and the join nudge (returns `false`) |
| 6 | `invitations` | 5 | private replies and the `inv:` buttons |
| 7 | `memories` | 5 | `/memory`, and replies to memory posts |
| 8 | `intents` | 5 | group messages that match the ask pattern, every other private message, and the `nxt:` buttons |
| 9 | `capture` | 5 | every other group message, and the bundle close on each tick |
| 10 | `shares` | 5 | the `shr:` buttons; its tick runs after the capture tick, so the tick sees the new moments |
| 11 | `echoes` | 5 | no events; its tick runs after the capture tick |
| 12 | `calls` | 7 | no events; its tick runs the reminder calls and the daily call |

- `reminders` runs before `members`, so `/start r_<id>` confirms the reminder before the welcome goes out.
- A feature that returns `false` after a side effect (the offer, the nudge) lets `capture` still see the message.

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
| `TWILIO_FROM` | unset | v2: the Twilio number that Anchor calls from, in E.164. When the variable is unset, the choices screen hides "Call me". |
| `ANCHOR_PUBLIC_URL` | unset | v2: the `https://` base URL of `anchor-bot`. The call stream connects to `wss://` on the same host. |
| `ANCHOR_REALTIME_MODEL` | `gpt-realtime-2.1-mini` | v2: the OpenAI Realtime model of the call. UNVERIFIED: the model name. Step 7 confirms the name against the Realtime guide. |

The call also uses `OPENAI_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY_SID`, and `TWILIO_API_KEY_SECRET`, which `apps/api/.env.example` already holds.

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

### 6.7 Read an intent (v2, step 5)

- The prompt holds the chat kind (group or private), the typed text or the caption, and one line per intent with one example. The prompt also holds one line per moment, as section 6.4 describes.
- A voice note goes in as audio in the same call.
- The schema is `{ intent: enum, momentId: enum }`. The intents are `memory`, `find`, `sendMe`, `missed`, `settings`, `stop`, `callMe`, `forget`, `quiet`, and `unclear`. The moment ids are the ids of the moments that are not sensitive, and `none`.
- The call uses the default model, as section 6.4 does.
- An invalid intent counts as `unclear`. `find` with `none` gets `notFound`.

### 6.8 Read a reminder offer (v2, step 6)

- The prompt holds the sender's name, the text, the local time and weekday of the demo clock, and one line per member: id and name.
- The schema is `{ offer: boolean, who: enum, time: string }`. `who` holds the member ids and `unknown`. `time` is `HH:MM` in 24-hour local time, or an empty string.
- The prompt says no by default. `offer` is true only when a member must remember a future action that has a time or a trigger, for example "take my pills when we leave in the morning". Plans for the whole family, past events, questions, and jokes get false.
- The prompt maps "in the morning" to 08:00 and "tonight" to 20:00. A stated clock time wins.
- The call uses the fast models. A failed call, or `offer` false, makes no offer. An invalid `who` counts as `unknown`. An invalid `time` counts as an empty string.

### 6.9 The call voice (v2, step 7)

- The Realtime session gets instructions that follow section 1, the call lines of section 4.9, and the moment of the call in the sharer's words.
- The audio is G.711 μ-law from end to end, so the bridge never transcodes during the call.
- After the call, `ffmpeg` converts the captured audio of the member's side to OGG Opus, as `transports/voice.ts` does for WAV. The transcript of the member's words comes from the Realtime input transcription, or from `transcribe` on the captured audio.

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

v2 additions (step 5). The Bot API docs of Bot API 10.3 are the source.

- `onlyFor` sends the message with `ephemeral_message_parameters: { receiver_user_id }`. The result `messageId` is the `ephemeral_message_id`. Anchor must be a group admin to send an ephemeral message at any time.
- `toIncoming` sets `ephemeral` and takes `ephemeral_message_id` as `messageId` when `message_id` is 0. This rule covers an ephemeral command and a tap on an ephemeral message.
- `edit` with `text` uses `editMessageText`, or `editEphemeralMessageText` with `receiver_user_id` and `ephemeral_message_id`. `edit` with only `buttons` uses `editMessageReplyMarkup`, or `editEphemeralMessageReplyMarkup`.
- `remove` uses `deleteMessage`, or `deleteEphemeralMessage`.
- `Button.contact` becomes a reply keyboard with one `request_contact` button, `one_time_keyboard`, and `resize_keyboard`. A reply keyboard works in private chats only.
- `Outgoing.contact` uses `sendContact` with `phone_number` and `first_name`.
- `toIncoming` maps `message.contact` to `contact`, with `phone_number` and `user_id`.
- `setMyCommands` registers `/fastforward` with `is_ephemeral: true`, and drops `/private` and `/send`.
- ✍ is U+270D in the allowed reaction list.
- UNVERIFIED: ephemeral messages in a basic group. The edit and delete methods name "the target supergroup". The first task of step 5 sends one ephemeral test message in the test group on the dev bot.

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
- **v2 ephemeral messages**: a failed ephemeral send logs, and `sendOffer` records no offer. A failed nudge still counts as sent. A failed edit or a failed remove logs, and the record change stays, because the message can be gone already.
- **v2 model calls**: a failed intent call counts as `unclear`. A failed offer call makes no offer.
- **v2 private sends**: `tell` handles `Blocked` for every feature. A reminder to a member who blocked Anchor counts as `sent`.
- **v2 calls**: `callMember` returns `false` on any failure before the member answers, for example a dialing permission, a missing phone, or a missing `TWILIO_FROM`. A dropped call keeps nothing, except a story that the member already agreed to share.

Known limits:

- A person is a storyteller in one family only. v2: a person is a member in one family only.
- v2: an ephemeral message is not guaranteed to arrive, especially when the member is offline. Offers, nudges, and the `/fastforward` reply accept that limit. A reminder never depends on an ephemeral message, because the reminder arrives in private.
- v2: offers and nudges need Anchor as a group admin.
- v2: Anchor calls from a US number. A Greek number needs a Twilio regulatory bundle, which waits until after the demo.
- Open bundles live in memory, so a restart loses at most 2 minutes of messages.
- Cloud Storage FUSE has no concurrency control, and the last write wins. During a rollout, an old and a new instance can run for a short time, so deploy while the family is quiet.

## 9. Tests

All tests run with `pnpm nx test api` (vitest) and make no network call.

- Pure units: the clock and `slotIn`, `byPriority` and `isAnniversary`, the lookback rules, the filter rules, the bundler, the validators, the store round trip, the corrupt-file path, the router order, and `toIncoming` for each update kind.
- Features: each feature has flow tests through `FakeTransport`, with a fixed clock and `vi.mock` of `gemini.ts`.
- Voice: one test converts a generated WAV and checks the `OggS` header. The test skips when `ffmpeg` is missing.
- End to end: the checklist of step 3 in a Telegram test group.
- v2 units: the reminder gate, the four times around a suggestion, the next local `HH:MM`, `/fastforward HH:MM` with `restartWindow`, and `fadeOffers`.
- v2 flows through `FakeTransport`, which records `onlyFor`, each edit, and each remove:
  - Step 5: the nudge goes out once; `/start` with each payload; each toggle; the phone share; a share offer that delivers an invitation; each intent with a mocked model; the voice path of `tell`.
  - Step 6: a reminder offer that a started member sets, then `/fastforward 08:05` delivers the reminder; the `r_` Start path; each easy no; the fade.
  - Step 7: the bridge test of the call proof, and `callMember` with a fake Twilio client.
- v2 demo flow: step 5 rewrites `demo-flow.test.ts` to walk the v2 demo script after steps 5 and 6 merge.

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

v2 steps. Step 4 merges first. Steps 5, 6, and 7 then run in parallel, one session each, and each file has one owner (section 5.2).

| Step | Branch | Needs | Scope | Done when |
| --- | --- | --- | --- | --- |
| 4 Contract | `feat/v2-contract` | none | The rename, the contract of section 5.3, `joinMember`, `core/offers.ts`, the text path of `core/tell.ts`, `shareStory`, the `FakeTransport` additions, the stubs, the `FEATURES` order, `restartWindow`, the lines of steps 6 and 7, and `.env.example`. The orchestrator lands this step. | Every v1 test passes after the rename, and the v1 behaviour is unchanged. |
| 5 Members and the guide | `feat/v2-members-guide` | 4 | Sections 4.5 to 4.7, 4.11, 4.12, 4.14, 6.7, and the v2 transport additions of section 7. | The flow tests pass, and the dev bot walks the join, the choices, a share offer, and a voice reply. |
| 6 Offers and reminders | `feat/v2-reminders` | 4 | Sections 4.10 (the clock time) and 4.13, and section 6.8. | The flow tests pass, and the dev bot delivers a reminder after `/fastforward 08:05`. |
| 7 The call | `feat/v2-phone-call` | 4, and the call proof | Sections 4.15 and 6.9, the ingress, and the deploy notes. | "Anchor, call me" rings a demo phone through the deployed bot, and a shared call story reaches the group. |
| 8 v2 rehearsal | from the step 3 session | 5 and 6 | The v2 demo script, the deploy with the user's go, and two rehearsals. | The team rehearses the v2 script twice against the live bot without a blocker. |

- Only one process may poll one token. The orchestrator hands the dev bot token to one session at a time.
- Steps 6 and 7 build against `FakeTransport` until step 5 lands the Telegram additions.
- Each deploy needs the user's explicit go. The change of `anchor-bot` to `--allow-unauthenticated` needs a separate go.

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
- v2: base each v2 branch on `origin/main` after the step 4 merge. Change only the files that section 5.2 gives to the step.
