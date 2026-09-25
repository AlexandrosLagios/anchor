# Spike: Anchor as a member of a family group chat

> The design in `docs/specs/2026-09-25-family-memory-design.md` reframes the product around the family record. That design replaces decisions 3, 4, and 7, and it settles the open questions below.

## Problem

Anchor must join a family group chat. The pitch names WhatsApp, but any messaging platform that fits the hackathon qualifies. In the group, Anchor must do four things:

1. Gather every message: the text, the photos, the voice notes, and the sender.
2. Filter each incoming message for its value as a future memory.
3. Send spaced-retrieval prompts to one or more target members, in private or in the group.
4. Let Gemini choose when to bring a memory back, in the manner of Google Photos Memories. Each prompt must be pleasant, interactive, and non-judgemental.

The registration website is out of scope for this spike.

## Findings

### The current prototype

- The prototype talks to one WhatsApp number through the Twilio Sandbox, not to a group. The sandbox sender is a constant (`apps/api/src/app/twilio.ts:1`).
- One field, `familyNumber`, holds both the person who shares a moment and the person who answers a prompt (`apps/api/src/app/anchor.service.ts:100`).
- The webhook treats every inbound message as an answer while a prompt waits, and as a new moment otherwise (`apps/api/src/app/anchor.controller.ts:51`). In a group, this rule misroutes the messages of every other member.
- Both dashboards simulate the group chat (`apps/api/src/assets/index.html:514`, `apps/web/src/components/Dashboard.tsx:176`).
- All state lives in memory (`apps/api/src/app/anchor.service.ts:101`). A restart loses every moment and every schedule.
- The schedule starts at one day. A free recall doubles the gap, a cued recall holds the gap, and a struggle resets the gap to one day (`apps/api/src/app/protocol.ts:16`).
- Every prompt lands at 11:00 local time (`apps/api/src/app/protocol.ts:25`).
- The family gets a note only after a success, never after a lapse (`familyNote` in `apps/api/src/app/protocol.ts`).
- Gemini writes every line that Anchor uses at save time, through one schema (`MOMENT_SCHEMA` in `apps/api/src/app/anchor.service.ts`).
- The code persona is Athina, a 76-year-old grandmother (`apps/api/src/app/protocol.ts:6`). The pitch describes a grandfather.
- The Gemini client caches every answer on disk to stay inside the free tier (`apps/api/src/app/gemini.ts:20`).
- The Notion hackathon brief was not read. The `notion-openconf` server returned `401 unauthorized` for page `3aa9ca0cda4c80d190e5dd517d462084`.

### Telegram

- A Telegram bot with privacy mode off gets every group message "like an ordinary user". The bot must rejoin the group after the change. [1]
- An admin bot always gets every group message, whatever the privacy mode. [1]
- A Telegram bot cannot start a private chat. The person must tap Start or send a message to the bot first. [2]
- A deep link `https://t.me/<bot_username>?start=<parameter>` opens the private chat, and the bot then gets `/start <parameter>`. The parameter holds up to 64 characters from `A-Z`, `a-z`, `0-9`, `_`, and `-`. [1]
- A `my_chat_member` update tells the bot about each change of its own status in a chat. An example is a member who adds the bot to a group. [3]
- Telegram inline keyboards work in groups and in private chats. [4]
- Bot reactions come from a fixed emoji list. A bot gets reaction updates only when the bot is an admin of the chat. [5]
- UNVERIFIED: a bot can set a reaction in a group without admin rights.
- A Telegram bot sends at most 20 messages per minute in one group, and bots never see the messages of other bots. [6]
- A Telegram voice note must be OGG Opus, MP3, or M4A. A bot downloads files of up to 20 MB and uploads files of up to 50 MB. [4] [6]
- A Telegram bot can use long polling with `getUpdates`, so the bot needs no public URL. [4]
- The pitch says: "There is no new app to learn or install." A family without Telegram must install Telegram to use Anchor.

### Deployment

- `DEPLOY.md` deploys the API to Cloud Run with the default settings. Firebase Hosting sends `/api/**` to the Cloud Run service (`firebase.json`).
- By default, Cloud Run allocates CPU only during request processing. The `--no-cpu-throttling` flag allocates CPU for the whole lifecycle of the instance. [21]
- A service with no traffic scales in to its minimum number of instances, which is zero by default. [22]
- The Cloud Run filesystem is in memory. The data does not persist when the instance stops. [22]

### Rejected platforms

- WhatsApp through the official API: only an Official Business Account can use the Groups API [7]. The account needs at least 30 days on the platform and Business Verification [9].
- WhatsApp through the official API: the business creates the group, and members join by an invite link. A group holds at most 8 participants [7] [8].
- WhatsApp through an unofficial client, such as WAHA or Baileys: the client breaks the WhatsApp Terms of Service [10], and a ban is permanent [11].
- WhatsApp through an unofficial client: the Anchor account needs a second number, such as a landline or a prepaid SIM [12].
- The Twilio Sandbox: the sandbox is for tests only, handles only 1:1 chats, and each membership expires after 3 days [13].
- Viber: the Viber REST Bot API has no group feature. Since 5 February 2024, Viber bots exist only on commercial terms [14].

### Gemini

- Gemini accepts `audio/ogg` and `audio/opus`, so a Telegram voice note goes to Gemini without conversion. An inline request holds at most 20 MB. [15]
- Gemini TTS returns WAV, PCM, mu-law, or A-law audio, and Gemini TTS supports Greek. The default is 24 kHz mono 16-bit PCM in a WAV file. [16]
- Each TTS clip needs one conversion to OGG Opus before the clip goes out as a Telegram voice note. [4] [16]
- The Gemini API terms say: "Do not submit sensitive, confidential, or personal information to the Unpaid Services." Human reviewers can read free-tier input. [17]
- The same terms forbid a service that people under 18 are likely to access. A grandchild in the family group can bring Anchor under this clause. [17]

### Spaced retrieval

- The clinical protocol doubles the interval after each correct recall: 15 seconds, 30 seconds, 1 minute, 2 minutes, and so on. [18]
- After a failed recall, the clinician gives the answer and asks the person to repeat it. The next prompt comes at the last successful interval, not at the start. [18]
- The protocol applies errorless learning, so the person never practises a wrong answer. [18]
- The protocol trains one or two targets at the start, and at most three at a time. [18]
- USMART, a self-administered tablet program, trained 50 people with MCI twice per week for 4 weeks. Word-list recall improved with an effect size of 0.49, but global cognition did not. [19]
- The USMART intervals doubled from 0.75 minutes to 12 minutes inside one session. Clinical intervals are seconds to minutes. No source in this spike tests a schedule in days.

### Google Photos Memories

- Google Photos uses machine learning to filter out bad, boring, and sensitive content, to remove near-duplicates, and to score aesthetics. [20]
- Google Photos lets a user hide people and time periods from Memories. [20]

### Sources

1. https://core.telegram.org/bots/features
2. https://community.make.com/t/telegram-bot-error-bot-cant-initiate-conversation-with-a-user/47720
3. https://docs.python-telegram-bot.org/en/v21.9/telegram.chatmemberupdated.html
4. https://core.telegram.org/bots/api
5. https://grammy.dev/guide/reactions
6. https://core.telegram.org/bots/faq
7. https://developers.facebook.com/documentation/business-messaging/whatsapp/groups
8. https://developers.facebook.com/documentation/business-messaging/whatsapp/groups/get-started
9. https://developers.facebook.com/documentation/business-messaging/whatsapp/official-business-accounts
10. https://www.whatsapp.com/legal/terms-of-service-eea
11. https://achiya-automation.com/en/blog/whatsapp-spam-detection-2026/
12. https://sinch.com/blog/whatsapp-business-using-landline/
13. https://www.twilio.com/docs/whatsapp/sandbox
14. https://developers.viber.com/docs/api/rest-bot-api/
15. https://ai.google.dev/gemini-api/docs/audio
16. https://ai.google.dev/gemini-api/docs/speech-generation
17. https://ai.google.dev/gemini-api/terms
18. https://tactustherapy.com/spaced-retrieval-training-memory/
19. https://pmc.ncbi.nlm.nih.gov/articles/PMC5461696/
20. https://medium.com/people-ai-research/a-snapshot-of-ai-powered-reminiscing-in-google-photos-5a05d2f2aa46
21. https://docs.cloud.google.com/run/docs/configuring/billing-settings
22. https://docs.cloud.google.com/run/docs/container-contract

## Decisions

1. **Which chat platform does the hackathon build use?** A Telegram bot.
   - Reason: a Telegram bot needs no phone number, has no ban risk, and uses the official Bot API.
   - Reason: every WhatsApp route needs an Official Business Account, or an unofficial client with a second number and a ban risk. The user has no spare SIM.
   - Reason: Viber bots cannot join a group.
   - History: the user first chose WhatsApp through WAHA, then changed to Telegram when WAHA needed a second number.
   - Accepted cost: most families install Telegram first. The pitch changes from "WhatsApp groups" to "the family group chat".
   - Accepted cost: the line "no new app to learn or install" is no longer true for every family.
2. **Which number hosts the Anchor account?** No number. A Telegram bot gets a token from BotFather.
3. **Where do spaced-retrieval prompts reach the target?** In the private chat between the target and Anchor. The group sees only the good news.
   - The target taps Start once, through a deep link that Anchor posts in the group.
   - In the group, Anchor reacts to each saved moment with an emoji and posts no text.
   - After a success, Anchor asks the target "Shall I tell the family?". Anchor posts the note in the group only after a yes.
   - Reason: a hesitation stays private, which matches errorless learning and the rule in `familyNote` (`apps/api/src/app/protocol.ts`).
   - Reason: in the private chat, every message from the target is an answer, so Anchor never has to separate answers from family chat.
4. **How does the target answer a prompt?** By a voice note or by text. Gemini judges the recall. Two buttons sit under each prompt.
   - "💡 A little hint" sends the voice note of the family member when the moment came with one. Otherwise, the button sends a text cue.
   - "🙂 Tell me" sends a warm reveal. Then Anchor asks the target to say the answer back, which is the errorless step of the protocol.
   - Reason: spaced retrieval needs a real retrieval. A self-rating button cannot tell recall from politeness.
   - Reason: the buttons give the target a way out without a failure.
   - Cost: Gemini TTS returns no OGG Opus. Each voice note from Anchor needs one `ffmpeg` conversion.
5. **How much freedom does Gemini get?** As little as possible. The user asked for a lot of determinism around Gemini.
   - Gemini returns only schema-validated JSON at fixed points. Enums replace free text wherever a decision is made.
   - The code owns every state transition, every schedule, and every routing decision.
   - Gemini writes every line that Anchor sends at save time, and the code stores the lines. The prototype already does this (`MOMENT_SCHEMA` in `apps/api/src/app/anchor.service.ts`).
   - When a Gemini call fails or returns an invalid value, the code takes a fixed fallback path.
6. **Who chooses which memory goes out next, and when?** Gemini scores each moment once at save time, and the code picks.
   - At save time, Gemini fills a fixed schema: `salience` from 1 to 5, a `tone` enum (joyful, neutral, sensitive), `people`, and `eventDate`.
   - At send time, the code applies a fixed order. Only due moments qualify. An anniversary goes first, then the highest salience, then the most overdue moment.
   - Gemini is not called at send time, so the same state always gives the same prompt.
   - Reason: this rule keeps the Google Photos behaviour of scoring, anniversaries, and filters, and still meets decision 5.
   - This decision replaces requirement 4 in its literal form: Gemini does not choose the time.
7. **Which spacing ladder and cadence does the code use?** The protocol ladder with two send slots per day.
   - The first return comes at the first slot that is at least a few hours after the save. Then the steps are 1, 2, 4, 8, 16, and 32 days.
   - A free recall moves the moment up one step. A recall after a hint holds the step. "Tell me" moves the moment back to the last step that the target passed.
   - At most 3 moments are in training for each target. The other moments wait in the queue in the order of decision 6.
   - The send slots are 11:00 and 18:00 local time, with at most one prompt per slot.
   - An unanswered prompt has no penalty. The moment waits for the next slot on the same step.
   - Reason: the protocol returns to the last successful interval after a miss and trains 1 to 3 targets at a time [18]. The prototype resets to one day (`apps/api/src/app/protocol.ts:16`).
   - Reason: the pitch asks for "a second encounter", and the same-day return gives that encounter.
   - Limit: no source tests steps in days. The steps are a product choice.
8. **How strict is the memory filter?** Strict. Fixed code rules run first, then one Gemini call per bundle returns an enum verdict.
   - The code drops stickers, GIFs, commands, service messages, forwarded messages, link-only messages, and short texts with no media.
   - The code bundles the messages of one sender within 2 minutes. A Telegram album is one bundle.
   - One Gemini call per bundle returns a `verdict` enum: `family_moment`, `logistics`, `small_talk`, or `sensitive`. The same call returns the fields of decision 6 and the lines that Anchor uses later.
   - The code saves only a `family_moment`.
   - A `sensitive` bundle covers illness, death, conflict, money, or the health of the target. A sensitive bundle never reaches a target.
   - The code keeps a photo only when the same bundle holds words from the same sender. A bare photo has no answer to recall.
   - Reason: reminiscing features fail when they bring back grief. Google Photos filters sensitive content and lets users hide people and dates [20].
9. **Whose data flows through the build, and on which Gemini tier?** A staged family on the free key.
   - Team members play the family in a test group with staged photos.
   - The build uses the Gemini key that already exists in `apps/api/.env.local`. The build needs no new key.
   - Reason: the free tier forbids personal information, and human reviewers can read free-tier input [17]. Staged data keeps the build inside the terms at no cost.
   - Accepted cost: the free TTS cap stays at about 10 requests per model per day (`apps/api/src/app/gemini.ts:20`). The disk cache reduces repeated requests.
   - In every case, Anchor posts an introduction when it joins the group. Any member can reply "Anchor, forget this" to delete a moment.
10. **How does the demo show spacing that normally takes days?** A demo clock and the manual trigger.
    - One environment variable sets the number of real seconds in one simulated day, for example 60.
    - All scheduling code reads the time through one `now()` function. The send slots and the ladder steps then play out in minutes.
    - The web dashboard keeps "bring back now" (`POST /api/bring-back`, `apps/api/src/app/anchor.controller.ts:110`) for exact timing on stage.
    - Reason: the tests use the same clock, so the ladder and the picker stay deterministic under test.

The interview covered every aspect that is not straightforward. The remaining details take the defaults in approach A.

## Open questions

- **The hackathon brief is unread.** The `notion-openconf` server returns `401 unauthorized`. The brief can hold rules on the demo format, the judging, and the deadline. The user runs `claude mcp login notion-openconf` in the repository root, and then a session reads the brief.
- **The pitch text changes.** "WhatsApp groups" becomes "the family group chat". The line "no new app to learn or install" is no longer true for every family. The team writes the new wording.
- **The persona differs.** The code names Athina, a grandmother (`apps/api/src/app/protocol.ts:6`). The pitch names a grandfather. The team names the staged family before `shape`.
- **The language is open.** Commit `3e28fc7` moved the prototype to English. Approach A keeps one language per group, English by default. The team confirms whether the staged family writes in Greek.
- **The Cloud Run setup is open.** With the settings in `DEPLOY.md`, the polling loop and the send tick stop between requests. The JSON file disappears when the instance stops. The team decides before the first deploy.
  - Option 1: one always-on instance (`--min-instances=1 --max-instances=1 --no-cpu-throttling`), with the JSON file on persistent storage. The code of approach A stays as it is.
  - Option 2: a Telegram webhook at `/api/telegram`, Cloud Scheduler for the tick, and Firestore for the state. This option changes the transport and the storage of approach A.
- **The ladder has no clinical review.** No source tests steps in days. The music therapist named in `apps/api/src/app/song.ts` can review the ladder and the lines.
- **The archive is open.** Approach A keeps only saved moments and discards every other message. The design of the website decides whether an archive of all messages is necessary.

## Approaches

### A. A Telegram bot inside the NestJS API, with long polling and `fetch` (recommended)

The transport:

- A new file `apps/api/src/app/telegram.ts` replaces `apps/api/src/app/twilio.ts`. The file calls the Bot API with `fetch`, as `twilio.ts` does today, and adds no dependency.
- A `getUpdates` loop with a long-poll timeout gets every update. The build needs no public URL and no tunnel.
- The bot is an admin of the group. An admin bot gets every message and every reaction update, so the privacy mode and the reaction rights stop being a concern [1] [5].
- Anchor posts its introduction when a `my_chat_member` update shows that a member added Anchor to the group [3].

The ingest flow:

1. The code rules of decision 8 drop the noise and bundle the rest.
2. `getFile` downloads the photo or the voice note of the bundle.
3. One Gemini call returns the verdict, the scores of decision 6, and every line that Anchor uses later.
4. For a `family_moment`, the code saves the moment and reacts on the first message of the bundle.
5. The code puts the moment in the queue of each target.

The send flow:

1. A tick runs every few real seconds and reads the demo clock.
2. For each target with no waiting prompt, in an open slot, the picker of decision 6 takes the first due moment.
3. Anchor sends the photo by its Telegram `file_id`, the question, one TTS voice note of the question, and the two buttons.

The answer flow:

- One Gemini call returns the `transcript` and a `recall` enum: `recalled`, `not_recalled`, or `unclear`.
- `recalled` before a hint: Anchor sends the praise, the moment moves up one step, and Anchor asks "Shall I tell the family?".
- `recalled` after a hint: Anchor sends the praise, the moment holds its step, and Anchor asks "Shall I tell the family?".
- `not_recalled` or `unclear` before a hint: Anchor sends the hint.
- `not_recalled` or `unclear` after a hint: Anchor sends the reveal and asks the target to say the answer back. The moment moves back to the last step that the target passed.
- After the reveal, any reply gets a fixed closing line with no judgement.
- A failed or invalid Gemini call counts as `unclear`.

The setup commands:

- A group admin replies `/target` to a message of a member. Anchor then posts a deep link with a Start button for that member.
- A reply "Anchor, forget this" to a saved message deletes the moment.

The storage, the voice, and the clock:

- One JSON file holds the targets, the moments, and the training state. The code writes the file after each change. SQLite replaces the file when more than one family uses the build.
- The code stores Telegram `file_id` values, not media files. Telegram resends a photo or a voice note by its `file_id`.
- Anchor records one TTS clip per moment, for the question only, because of the free TTS cap. The praise and the reveal go out as text.
- `ffmpeg` converts each WAV clip to OGG Opus before `sendVoice`.
- `now()` scales real time by `ANCHOR_DAY_SECONDS`. The default is 86400.

The tests:

- The ladder, the picker, and the filter rules are pure functions with vitest tests, run by `pnpm nx test api`.
- The unit tests make no Gemini call. `apps/api/rehearse.mjs` runs one loop from end to end against a running API.

The trade-offs:

- For: the smallest change to the prototype shape, no new dependency, no tunnel, the official API, and no ban risk.
- Against: long polling and the tick need one process that always runs. A laptop or one always-on Cloud Run instance can be that process. See the open question on Cloud Run.
- Against: `ffmpeg` becomes a host dependency.
- Against: the pitch changes, as decision 1 records.

### B. A Telegram bot through grammY

- The core of approach A stays. The grammY framework replaces the hand-written calls in `telegram.ts`.
- For: typed updates, middleware, and plugins for sessions and conversations.
- Against: one new dependency for about 8 Bot API methods. The flows of approach A hold no multi-step dialogue that a conversations plugin shortens.

Recommendation: approach A. Approach A changes the fewest files, needs no dependency and no tunnel, and keeps every decision deterministic.

## Next step

Run `/shape docs/spikes/2026-09-25-family-group-chat-spike.md`. The change touches about 10 files in `apps/api`, `apps/web`, and the deploy configuration. The workflow rule for a single feature applies: `shape`, then an implementation in one session.
