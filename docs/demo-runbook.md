# Demo runbook: Anchor v2 live in a family group

The live demo takes about 3 minutes of the 6-minute presentation. It shows Anchor v2: no commands, every member chooses what Anchor sends them, a share offer, a reminder offer, and voice both ways. The phone call is the stretch goal.

The demo runs against the live bot `@anchor_family_bot` on Cloud Run (`DEPLOY.md`). The rehearsals run against the dev bot `@anchor_family_dev_bot` in its own group, because `/fastforward` moves the clock of the live bot for good. Every line and every staged message is in English.

## Cast

| Role | Who | Screen |
| --- | --- | --- |
| Eleni, the daughter | Teammate 1, a group admin | The family group |
| Nikos, the grandfather | Teammate 2 | The family group, then his private chat with Anchor |
| Presenter | Teammate 3 | Narrates, and shows both phones side by side |

Anchor takes every name from Telegram. Set the first name of each demo account to its role name before the demo, for example "Eleni" and "Nikos".

## Before the demo

Check the bot and the group:

1. Make sure that the live bot runs the v2 build: revision `anchor-bot-00005-fxt` (commit `a479654`) or later. The technical runbook names the current revision.
2. Use the group of the demo. A person is a member in one family only, so a new group sends Nikos's private replies to the old family.
3. Make sure that Anchor is an admin in the group. Anchor sends an ephemeral message only as an admin. Promote Anchor at least one day before, because a move to a supergroup posts `intro` a second time.
4. Turn "Remain anonymous" off for Eleni. Anchor ignores commands from an anonymous admin.
5. For beat 7 only, pass the call gate:
   - `anchor-bot` is open for calls: steps 1 to 4 of "Phone calls" in `DEPLOY.md`, each with the user's go. `ANCHOR_BOT_ONLY=true` must be set before the service opens.
   - Nikos turned on "Call me on the phone" and shared his phone number with the one-tap button. He saved the "Anchor" contact card, because Anchor calls from a US number.
   - Greece is on in the Twilio voice geo permissions, for low-risk numbers. It is on since 2026-09-25.
   - After the last deploy, "Anchor, call me" rang his phone once.

Reset and prepare, before the demo and before each rehearsal:

1. Remove the moments of the rehearsals. Reply "Anchor, forget this" to each rehearsal photo.
2. Let Nikos send "stop" to Anchor in private. Every choice goes off, so Nikos can join again on stage.
3. Put a staged photo of a child's first day at school on Eleni's phone.
4. Keep a screen recording of the best rehearsal ready. Play the recording if the live bot fails.

## The script

Each beat names the action and what the audience sees. The times include about 5 seconds of model latency per beat, so the presenter narrates while Anchor works.

| Beat | Time | Who | Action | The audience sees |
| --- | --- | --- | --- | --- |
| 1 | 0:00 | Nikos | In the group, write "Anchor, can you send me the family photos?" | Only Nikos sees Anchor's answer: "Nikos, I can send you family moments, reminders, and voice notes in private. Tap to choose 🙂", with the button "Choose what I send you". Eleni's screen shows only his question. No command, and no admin acts for him. |
| 2 | 0:20 | Nikos | Tap "Choose what I send you", then Start. Tap "Family moments now and then" and "Talk to me by voice", then "Done". | Anchor says in plain words that it is not a person, and each choice turns ✅ in place. After "Done", Anchor answers with a voice note: "All set 💛". Every member chooses for themselves, and nobody needs to type or read. |
| 3 | 0:50 | Eleni | Post the photo with the caption "Maria's first day of school! She wore her new red backpack." | Anchor reacts with ❤. Only Eleni sees "Shall I send this to Nikos now?". She taps "Yes, send it", and the offer turns into "Sent to Nikos 💛". |
| 4 | 1:10 | Nikos | In private, play the voice note, then answer with a voice note of about 10 seconds: "My first day was in 1958. My mother walked me to the village school, and I cried at the gate." Tap "Yes, share it". | Nikos gets the photo, then a voice note: "Eleni shared: «Maria's first day of school! …» What does it remind you of?". Anchor thanks him by voice. In the group: "Nikos added a story to Eleni's moment 🎙️", with his words, his voice note, and a big ❤. |
| 5 | 1:50 | Eleni | In the group, reply to Nikos's message of beat 1 with "Dad, remember to take your pills with you when we leave in the morning." | Only Nikos sees "⏰ Eleni wrote: «Dad, remember to take your pills…» Shall I remind you?", with "Yes, at 08:00", "Another time", "No thanks", and "Stop offering reminders". He taps "Yes, at 08:00". The offer turns into "Done ✍ I'll remind you at 08:00 in our private chat.", and Eleni's message gets a ✍. The family sees only the ✍: the pills stay private. |
| 6 | 2:15 | Eleni | Send `/fastforward 08:05` in the group. | Only Eleni sees "⏩ It's now … 08:05 on the family clock." A few seconds later, Nikos gets his reminder in private as a voice note: "⏰ Your reminder. Eleni wrote: «…»". |
| 7 | 2:35 | Nikos | The stretch goal, only when the call gate passed and the clock shows 2:35 or less. In private, say "Call me" in a voice note. Answer the phone on speaker. Answer Anchor in one sentence, say "No, thanks" to the share question, and "Yes" to the question about Eleni. | Anchor answers "I'm ringing you now 📞", and Nikos's phone rings. Anchor opens with "Hello Nikos, this is Anchor, the family's record keeper. I'm not a person." and reads Eleni's moment in her words. Anchor asks at most one follow-up, then "Shall I share what you told me with the family?". After his no, Anchor keeps nothing from the call. Anchor asks "Shall I tell Eleni you'd love a call?", and after his yes, the group gets "Eleni, Nikos would love a call from you 💛". Anchor says goodbye and hangs up. |
| 8 | 2:40 or 3:30 | Presenter | Close: "No commands. Nikos chose what he gets, heard Eleni's moment in her words, added his story by voice, and got his reminder in private. The family saw a ❤ and a ✍." | Both screens stay on the group. |

Beat 5 uses the sentence of the design, because Anchor offers a reminder only for a clear future action with a time or a trigger. Eleni writes the sentence as a reply, because the reply tells Anchor that "Dad" is Nikos. The rehearsals must show the offer both times.

The script does not show the gentle help for a hesitation ("a school?"), the "Another time" buttons, or the fade of an unanswered offer. The presenter can say one sentence about each.

Beat 7 skips the share on the call, because Nikos shared his story in beat 4. A "Yes" posts his words and his voice from the call in the group. "Just the words" posts his words without the voice. A call costs about 0.15 USD per minute, and lasts at most 10 minutes.

## If a beat fails

- No answer only for Nikos in beat 1 after 10 seconds: Nikos writes "Anchor, settings". The same button arrives. Both phrases are decided in code, so a miss here points at the bot or the network, not the model.
- No share offer for Eleni in beat 3 after 15 seconds: check that Nikos turned on "Family moments" in beat 2. Nikos then says "Send me a moment" to Anchor in private, and the photo arrives.
- Nikos's voice answer in beat 4 gets "Thank you 💛" instead of the share question: Anchor closed the invitation. Nikos says "Send me a moment" in private, and repeats beat 4.
- No reminder offer for Nikos in beat 5 after 10 seconds: Eleni writes "Dad, don't forget your pills tomorrow at 8." If no offer comes again, narrate beats 5 and 6, and continue with beat 7 or 8.
- No reminder after `/fastforward` in beat 6 after 10 seconds: narrate the reminder, and continue.
- The voice note "Call me" in beat 7 gets another answer: Nikos types "Call me". A typed "Call me" never goes to the model.
- "I couldn't ring you just now" in beat 7, or no ring after 15 seconds: say "The phone call is our next step", and close with beat 8.
- The call rings, but Anchor stays silent for 5 seconds: Nikos hangs up. Say "The phone call is our next step", and close with beat 8.
- Two beats fail: stop the live demo and play the screen recording.

To read what the bot did, run this command after the demo:

```bash
gcloud run services logs read anchor-bot --project=a11y-hack26ath-267 --region=europe-west1 --limit=50
```

## Rehearse twice

Caution: `/fastforward` moves the family clock of the whole bot for good. After a jump, the 11:00 and 18:00 slots fire at other real times, and every new moment shows a date of the demo clock. For that reason, rehearse on the dev bot, and use the live bot for beats 1 to 5 only.

1. Before each rehearsal, do steps 1 and 2 of "Reset and prepare".
2. Run the full script on the dev bot with a stopwatch, and write down the time of each beat.
3. If the run takes more than 3 minutes without beat 7, shorten the narration first.
4. After the deploy of the v2 build, run beats 1 to 5 once on the live bot, without beat 6. Then do steps 1 and 2 of "Reset and prepare" again.
5. On the live bot, never run `/fastforward` before the demo. Beat 6 on stage is the only jump.
6. Rehearse beat 7 on the live bot after the call gate. On the dev bot, a call needs a public tunnel: run `ngrok http 3000`, and set `ANCHOR_PUBLIC_URL` to the ngrok URL in `apps/api/.env.local`.
