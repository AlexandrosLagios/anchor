# Demo runbook: Anchor v2 live in a family group

The 6-minute presentation is one story: the problem, a day in Sofia's family with Anchor, and the close. The live part shows Anchor v2: no commands, every member chooses what Anchor sends them, a share offer, a reminder offer, voice both ways, and a phone call that brings the reminder and a second family moment.

The demo runs against the live bot `@anchor_family_bot` on Cloud Run (`DEPLOY.md`). The rehearsals run against the dev bot `@anchor_family_dev_bot` in its own group, because `/fastforward` moves the clock of the live bot for good. Every line and every staged message is in English.

## Cast

Five teammates present, and four of them speak.

| Role | Who | Part |
| --- | --- | --- |
| Narrator | Teammate 1 | Tells the problem, and links the beats. |
| Eleni, the daughter | Teammate 2, a group admin | Phone 1, the family group. Speaks in character. |
| Sofia, the grandmother | Teammate 3 | Phone 2, the family group, then her private chat with Anchor. Speaks in character. |
| Closer | Teammate 4 | Closes the story, and takes the Q&A. |
| Operator | Teammate 5 | Shows both phones side by side, keeps the stopwatch, and plays the recording if two beats fail. Silent. |

Anchor takes every name from Telegram. Set the first name of each demo account to its role name before the demo, for example "Eleni" and "Sofia".

## Before the demo

Check the bot and the group:

1. Make sure that the live bot runs the v2 build: revision `anchor-bot-00007-zfm` (commit `3f5e1db`) or later. Revision `00007` takes the new first name of a renamed account, so Anchor calls the elder "Sofia". The technical runbook names the current revision.
2. Use the group of the demo. A person is a member in one family only, so a new group sends Sofia's private replies to the old family.
3. Make sure that Anchor is an admin in the group. Anchor sends an ephemeral message only as an admin. Promote Anchor at least one day before, because a move to a supergroup posts `intro` a second time.
4. Turn "Remain anonymous" off for Eleni. Anchor ignores commands from an anonymous admin.
5. For the call in beat 6, pass the call gate:
   - `anchor-bot` is open for calls: steps 1 to 4 of "Phone calls" in `DEPLOY.md`, each with the user's go. `ANCHOR_BOT_ONLY=true` must be set before the service opens.
   - Sofia turned on "Call me on the phone" and shared her phone number with the one-tap button. She saved the "Anchor" contact card, because Anchor calls from a US number.
   - Greece is on in the Twilio voice geo permissions, for low-risk numbers. It is on since 2026-09-25.
   - After the last deploy, "Anchor, call me" rang her phone once. The first call through the live bot worked on 2026-09-26, on the user's phone. Repeat it with the phone of the teammate who plays Sofia.

Reset and prepare, before the demo and before each rehearsal:

1. Remove the moments of the rehearsals. Reply "Anchor, forget this" to each rehearsal photo.
2. Let Sofia send "stop" to Anchor in private. Every choice goes off, so Sofia can join again on stage. Her phone number stays stored.
3. Let Eleni post a second staged photo in the group with the caption "Sunday lunch at the beach with the whole family!". The call in beat 6 reads this moment.
4. Put a staged photo of a child's first day at school on Eleni's phone.
5. Keep a screen recording of the best rehearsal ready. Play the recording if the live bot fails.

## The script

Each beat names the action, the spoken lines, and what the audience sees. The times include about 5 seconds of model latency per beat, so a speaker talks while Anchor works. With the call, the run ends at about 5:25. Without the call, the run ends at about 4:25.

### The problem (0:00, Narrator)

> This is Sofia. She lives on her own, and she likes it that way. Her family lives in a group chat: photos, plans, and jokes, all day long. By the time Sofia finds her glasses, the photos of her granddaughter are buried under forty new messages. She doesn't type well, and she doesn't want to be a burden, so she stops asking. Slowly, she drops out of her own family's story.
>
> Living independently isn't only about safety. It also means staying part of your family's life from your own home. Meet Anchor.

### The story, live

| Beat | Time | Who | Action | Spoken lines | The audience sees |
| --- | --- | --- | --- | --- | --- |
| 1 | 0:40 | Sofia | In the group, write "Anchor, can you send me family photos?" | Sofia, before: "Where are Maria's photos? I'll just ask." Narrator, after: "No command, no new app. Sofia asks in her own words, and only she sees the answer." | Only Sofia sees Anchor's answer: "Sofia, I can send you family moments, reminders, and voice notes in private. Tap to choose 🙂", with the button "Choose what I send you". Eleni's screen shows only Sofia's question. |
| 2 | 1:00 | Sofia | Tap "Choose what I send you", then Start. Tap "Family moments now and then", "Talk to me by voice", and "Call me on the phone", then "Done". | Sofia: "Voice? Good. I'd rather talk than type." | Anchor says that it is not a person, and each choice turns ✅ in place. After "Done", Anchor answers with a voice note: "All set 💛". |
| 3 | 1:35 | Eleni | Post the photo with the caption "Maria's first day of school! She wore her new red backpack." | Eleni, before: "Maria's first day of school. Mum has to see this." | Anchor reacts with ❤. Only Eleni sees "Shall I send this to Sofia now?". She taps "Yes, send it", and the offer turns into "Sent to Sofia 💛". |
| 4 | 2:00 | Sofia, then Eleni | In private, play the voice note, then answer with a voice note of about 10 seconds: "My first day was in 1958. My mother walked me to the village school, and I cried at the gate." Tap "Yes, share it". | Eleni, after the group post: "Mum, you never told me that. Maria has to hear this." Narrator: "Sofia isn't the one being helped here. She gives the family a story only she can tell." | Sofia gets the photo, then a voice note: "Eleni shared: «Maria's first day of school! …» What does it remind you of?". Anchor thanks her by voice. In the group: "Sofia added a story to Eleni's moment 🎙️", with Sofia's words and voice note, and a big ❤. |
| 5 | 2:50 | Eleni | In the group, reply to Sofia's message of beat 1 with "Mum, remember to take your pills with you when we leave in the morning." | Eleni, after the ✍: "And I don't have to nag her in front of everyone." | Only Sofia sees "⏰ Eleni wrote: «Mum, remember to take your pills…» Shall I remind you?", with "Yes, at 08:00", "Another time", "No thanks", and "Stop offering reminders". Sofia taps "Yes, at 08:00". The offer turns into "Done ✍ I'll remind you at 08:00 in our private chat.", and Eleni's message gets a ✍. The family sees only the ✍. |
| 6 | 3:20 | Eleni, then Sofia | Eleni sends `/fastforward 08:05` in the group. Sofia answers the phone on speaker, gives no answer to the reminder, and starts with a short story about the beach photo, says "Yes" to the share question, and says "Yes" to the question about Eleni. | Narrator, before: "Let's jump to tomorrow morning." Sofia, on the phone: "We went to that beach every summer. Your father grilled the fish." Eleni, after the group message: "I'll call you tonight, Mum." | Only Eleni sees "⏩ It's now … 08:05 on the family clock." A few seconds later, Sofia gets her reminder in private as a voice note, and her phone rings. Anchor opens with "Hello Sofia, this is Anchor, the family's record keeper. I'm not a person.", reads Eleni's reminder in Eleni's words, then reads the beach moment: "Eleni shared: «Sunday lunch at the beach with the whole family!» What does it remind you of?". Anchor asks at most one follow-up, then "Shall I share what you told me with the family?" and "Shall I tell Eleni you'd love a call?". In the group: "Sofia added a story to Eleni's moment 🎙️", then "Eleni, Sofia would love a call from you 💛". Anchor says goodbye and hangs up. |

### The close (4:40, Closer)

The close starts at 4:40 after the phone call of beat 6, or at 3:40 when the phone does not ring. Both screens stay on the group.

> Sofia asked in her own words, chose what Anchor sends her, added her story by voice, and got her reminder in a phone call. Nobody acted for her. The family saw a ❤ and a ✍.
>
> Anchor says it is not a person. It shares nothing without a yes, and it keeps a painful memory without ever bringing it back on its own.
>
> Anchor runs live today, in the group chat the family already uses. Anchor keeps the family's story, so nobody drops out of it.

Beat 5 uses the sentence of the design, because Anchor offers a reminder only for a clear future action with a time or a trigger. Eleni writes the sentence as a reply, because the reply tells Anchor that "Mum" is Sofia. The rehearsals must show the offer both times.

The script does not show the gentle help for a hesitation ("a school?"), the "Another time" buttons, or the fade of an unanswered offer. The Closer can answer about each in the Q&A.

The call in beat 6 needs the batched call, which is in development: one call reads the due reminder and then the newest moment that Sofia has no story for. Until the batched call lands, the call reads only the reminder and says goodbye, so the run ends about 50 seconds earlier. The call skips Maria's moment, because Sofia told her story about it in beat 4. Sofia gives no answer to the reminder, because every word before the share question goes out with her story, and the pills must stay private. A "Yes" posts her words and her voice from the call in the group. "Just the words" posts her words without the voice. A call costs about 0.15 USD per minute, and lasts at most 10 minutes.

## If a beat fails

- No answer only for Sofia in beat 1 after 10 seconds: Sofia writes "Anchor, settings". The same button arrives. Both phrases are decided in code, so a miss here points at the bot or the network, not the model.
- No share offer for Eleni in beat 3 after 15 seconds: check that Sofia turned on "Family moments" in beat 2. Sofia then says "Send me a moment" to Anchor in private, and the photo arrives.
- Sofia's voice answer in beat 4 gets "Thank you 💛" instead of the share question: Anchor closed the invitation. Sofia says "Send me a moment" in private, and repeats beat 4.
- No reminder offer for Sofia in beat 5 after 10 seconds: Eleni writes "Mum, don't forget your pills tomorrow at 8." If no offer comes again, the Narrator tells beats 5 and 6 in one sentence each, and the story continues with the close.
- No reminder after `/fastforward` in beat 6 after 10 seconds: the Narrator tells the reminder, and the story continues.
- No ring in beat 6 after 15 seconds: the Narrator says "The phone call is our next step", and the Closer starts the close.
- The call rings, but Anchor stays silent for 5 seconds: Sofia hangs up. The Narrator says "The phone call is our next step", and the Closer starts the close.
- Two beats fail: the Operator stops the live demo and plays the screen recording. The speakers say their lines over the recording.

To read what the bot did, run this command after the demo:

```bash
gcloud run services logs read anchor-bot --project=a11y-hack26ath-267 --region=europe-west1 --limit=50
```

## Rehearse twice

Caution: `/fastforward` moves the family clock of the whole bot for good. After a jump, the 11:00 and 18:00 slots fire at other real times, and every new moment shows a date of the demo clock. For that reason, rehearse on the dev bot, and use the live bot for beats 1 to 5 only.

1. Before each rehearsal, do steps 1 and 2 of "Reset and prepare".
2. Run the full script on the dev bot with a stopwatch, and write down the time of each beat.
3. If the run without the call takes more than 4:30, shorten the spoken lines first.
4. After the deploy of the v2 build, run beats 1 to 5 once on the live bot, without beat 6. Then do steps 1 and 2 of "Reset and prepare" again.
5. On the live bot, never run `/fastforward` before the demo. Beat 6 on stage is the only jump.
6. Rehearse the call of beat 6 on the live bot with a reminder in real time, because `/fastforward` stays off the live bot. Eleni replies to Sofia's message with "Mum, remember to take your pills at 10:45", a few minutes ahead, and Sofia taps the offered time. At 10:45, the reminder arrives and the phone rings. The dev bot cannot ring a phone without a public tunnel (`ngrok http 3000`, then `ANCHOR_PUBLIC_URL` in `apps/api/.env.local`).
