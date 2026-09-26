# Demo runbook: Anchor v2 live in a family group

The 6-minute presentation is one story: the problem with the website on the screen, a day in Sofia's family with Anchor, and the close back on the website. The live part shows Anchor v2: no commands, every member chooses what Anchor sends them, a share offer, a reminder offer, voice both ways, and a phone call that brings the reminder and a second family moment.

The demo runs against the live bot `@anchor_family_bot` on Cloud Run (`DEPLOY.md`). The rehearsals run against the dev bot `@anchor_family_dev_bot` in its own group, because `/fastforward` moves the clock of the live bot for good. Every line and every staged message is in English.

## Cast

Five teammates present, and four of them speak.

| Role | Who | Part |
| --- | --- | --- |
| Narrator | Teammate 1 | Tells the problem, and links the beats. |
| Eleni, the daughter | Teammate 2, a group admin | Phone 1, the family group. Speaks in character. |
| Sofia, the grandmother | Teammate 3 | Phone 2, the family group, then her private chat with Anchor. Speaks in character. |
| Closer | Teammate 4 | Closes the story, and takes the Q&A. |
| Operator | Teammate 5 | Shows the website during the problem and the close, shows both phones side by side during the story, keeps the stopwatch, and plays the recording if two beats fail. Silent. |

Anchor takes every name from Telegram. Set the first name of each demo account to its role name before the demo, for example "Eleni" and "Sofia".

## Before the demo

Check the bot and the group:

1. Make sure that the live bot runs the v2 build: revision `anchor-bot-00025-8jv` (commit `645f542`) or later. Revision `00014` connects Sofia to Eleni's phone at the end of the call. Revision `00015` says what a photo shows in the voice note and the call, for a photo captured after the deploy. Revision `00016` adds the scam shield. Revision `00017` asks a member for the phone number when the member taps "Call me" and has no number saved. Revision `00018` answers "Call me" with "You're up to date" when no new family moment is left to talk about, and labels the moment button "Send me a moment". Revision `00019` answers a question in private from the family record and the group chat, offers a reminder for a birthday that the group mentions, answers "memories of the dog" and "remind me about my pills", and shows the choices for any private message that says "settings". Revision `00020` answers "more memories of Lucy?" with moments that the group has not just seen, answers "Show me Lucy", and lets "A memory of Lucy" pass an open invitation. Revision `00021` serves the family record and its photos to the website at `/family`, and data export and deletion at `/my-data`, after a sign-in with Telegram. Revision `00022` posts a memory for a general request, such as "Give me a memory", without "Anchor,", and reads "@anchor_family_bot , ..." as "Anchor,". Revision `00023` reads a voice note as the text of its transcript, so a spoken request, such as "What did I miss?", gets the answer of the typed request. Revision `00024` rings the writer of a bare "Call me" in the group, says "Ask me anything about the family." after the share question of every call, and answers from the family record. With no new moment left, "Call me" now rings for questions, instead of "You're up to date". Revision `00025` answers a question in words and then shows the photo of the moment that the answer comes from, and code checks every number, name, and quote of the answer against the family record. It answers "Anchor, when did Maria start school?" in words, lets an album caption quote a family story, and says more about each photo, in at most 30 words, for a photo captured after the deploy. Revision `00007` takes the new first name of a renamed account, so Anchor calls the elder "Sofia". Revision `00008` reads the reminder and then a family moment in one call. The technical runbook names the current revision.
2. Use the group of the demo. A person is a member in one family only, so a new group sends Sofia's private replies to the old family.
3. Make sure that Anchor is an admin in the group. Anchor sends an ephemeral message only as an admin. Promote Anchor at least one day before, because a move to a supergroup posts `intro` a second time.
4. Turn "Remain anonymous" off for Eleni. Anchor ignores commands from an anonymous admin.
5. For the call in beat 6, pass the call gate:
   - `anchor-bot` is open for calls: steps 1 to 4 of "Phone calls" in `DEPLOY.md`, each with the user's go. `ANCHOR_BOT_ONLY=true` must be set before the service opens.
   - Sofia turned on "Call me on the phone" and shared her phone number with the one-tap button. She saved the "Anchor" contact card, because Anchor calls from a US number.
   - Eleni turned on "Call me on the phone" and shared her phone number too, so Anchor can connect Sofia to her. Eleni saved the "Anchor" contact card, because the connected call shows Anchor's US number.
   - Greece is on in the Twilio voice geo permissions, for low-risk numbers. It is on since 2026-09-25.
   - After the last deploy, "Anchor, call me" rang her phone once. The first call through the live bot worked on 2026-09-26, on the user's phone. Repeat it with the phone of the teammate who plays Sofia.

Reset and prepare, before the demo and before each rehearsal:

1. Remove the moments of the rehearsals. Reply "Anchor, forget this" to each rehearsal photo.
2. Let Sofia send "stop" to Anchor in private. Every choice goes off, so Sofia can join again on stage. Her phone number stays stored.
3. Let Eleni post a second staged photo in the group with the caption "Sunday lunch at the beach with the whole family!". The call in beat 6 reads this moment.
4. Put a staged photo of a child's first day at school on Eleni's phone.
5. Keep a screen recording of the best rehearsal ready. Play the recording if the live bot fails.
6. Open the website https://anchor-open26.vercel.app in a browser tab on the Operator's laptop, next to the phones. The screen shows its landing page when the presentation starts.

## The script

Each beat names the action, the spoken lines, and what the audience sees. The times include about 5 seconds of model latency per beat, so a speaker talks while Anchor works. With the call, the run ends at about 5:35. Without the call, the run ends at about 4:35.

### The problem (0:00, Narrator)

The screen shows the landing page of the website. On "Meet Anchor", the Operator switches the screen to both phones.

> This is Sofia. She lives on her own, and she likes it that way. By the time she finds her glasses, the photos of her granddaughter are buried under forty new messages in the family chat. She doesn't want to be a burden, so she stops asking. Slowly, she drops out of her own family's story.
>
> Living independently also means staying part of your family's life. Meet Anchor.

### The story, live

| Beat | Time | Who | Action | Spoken lines | The audience sees |
| --- | --- | --- | --- | --- | --- |
| 1 | 0:40 | Sofia | In the group, write "Anchor, can you send me family photos?" | Sofia, before: "Where are Maria's photos? I'll just ask." Narrator, after: "No command, no new app. Sofia asks in her own words, and only she sees the answer." | Only Sofia sees Anchor's answer: "Sofia, I can send you family moments, reminders, and voice notes in private. Tap to choose 🙂", with the button "Choose what I send you". Eleni's screen shows only Sofia's question. |
| 2 | 1:00 | Sofia | Tap "Choose what I send you", then Start. Tap "Family moments now and then", "Talk to me by voice", and "Call me on the phone", then "Done". | Sofia: "Voice? Good. I'd rather talk than type." | Anchor says that it is not a person, and each choice turns ✅ in place. After "Done", Anchor answers with a voice note: "All set 💛". |
| 3 | 1:35 | Eleni | Post the photo with the caption "Maria's first day of school! She wore her new red backpack." | Eleni, before: "Maria's first day of school. Mum has to see this." | Anchor reacts with ❤. Only Eleni sees "Shall I send this to Sofia now?". She taps "Yes, send it", and the offer turns into "Sent to Sofia 💛". |
| 4 | 2:00 | Sofia, then Eleni | In private, play the voice note, then answer with a voice note of about 10 seconds: "My first day was in 1958. My mother walked me to the village school, and I cried at the gate." Tap "Yes, share it". | Eleni, after the group post: "Mum, you never told me that. Maria has to hear this." Narrator: "Sofia isn't the one being helped here. She gives the family a story only she can tell." | Sofia gets the photo, then a voice note: "Eleni shared: «Maria's first day of school! …» The photo shows … What does it remind you of?". The voice note says what the photo shows, for a grandparent who cannot see it well. Anchor thanks her by voice. In the group: "Sofia added a story to Eleni's moment 🎙️", with Sofia's words and voice note, and a big ❤. |
| 5 | 2:50 | Eleni | In the group, reply to Sofia's message of beat 1 with "Mum, remember to take your pills with you when we leave in the morning." | Eleni, after the ✍: "And I don't have to nag her in front of everyone." | Only Sofia sees "⏰ Eleni wrote: «Mum, remember to take your pills…» Shall I remind you?", with "Yes, at 08:00", "Another time", "No thanks", and "Stop offering reminders". Sofia taps "Yes, at 08:00". The offer turns into "Done ✍ I'll remind you at 08:00 in our private chat.", and Eleni's message gets a ✍. The family sees only the ✍. |
| 6 | 3:20 | Eleni, then Sofia | Eleni sends `/fastforward 08:05` in the group. Sofia answers the phone on speaker, gives no answer to the reminder, and starts with a short story about the beach photo, says "Yes" to the share question, asks one question about the family, says "No, that's all", and says "Yes" to "Shall I connect you to Eleni now?". Eleni answers her phone on speaker. | Narrator, before: "Let's jump to tomorrow morning." Sofia, on the phone: "We went to that beach every summer. Your father grilled the fish." Sofia, after "Ask me anything about the family.": "When was Maria's first day of school?" Eleni, on her phone: "Hi Mum! I just saw your story." | Only Eleni sees "⏩ It's now … 08:05 on the family clock." A few seconds later, Sofia gets her reminder in private as a voice note, and her phone rings. Anchor opens with "Hello Sofia, this is Anchor, the family's record keeper. I'm not a person.", reads Eleni's reminder in Eleni's words, then reads the beach moment: "Eleni shared: «Sunday lunch at the beach with the whole family!» The photo shows … What does it remind you of?". Anchor asks at most one follow-up, then "Shall I share what you told me with the family?". Anchor says "Ask me anything about the family.", answers Sofia's question with the date of Maria's moment from beat 3, and asks "Shall I connect you to Eleni now?". Anchor says "Thank you, Sofia. I'm connecting you to Eleni now. Goodbye", leaves the call, and Eleni's phone rings. In the group: "Sofia added a story to Eleni's moment 🎙️". |

### The close (4:40, Closer)

The close starts at 4:40 after the phone call of beat 6, or at 3:40 when the phone does not ring. Both screens stay on the group until the Operator switches the screen to the website.

> Sofia asked in her own words, chose what Anchor sends her, added her story by voice, got her reminder in a phone call, and ended up talking to Eleni. Nobody acted for her. The family saw a ❤ and a ✍.
>
> Anchor says it is not a person. It shares nothing without a yes, and it keeps a painful memory without ever bringing it back on its own. And when a message pretends to be Eleni and asks for money, Sofia forwards it to Anchor, and Anchor tells her to call Eleni first.
>
> Anchor runs live today, in the group chat the family already uses. And you can try it yourself, on our website: anchor-open26.vercel.app.
>
> Anchor keeps the family's story, so nobody drops out of it.

On "our website", the Operator switches the screen from the phones to the landing page of the website. The screen stays on the website for the Q&A.

Beat 5 uses the sentence of the design, because Anchor offers a reminder only for a clear future action with a time or a trigger. Eleni writes the sentence as a reply, because the reply tells Anchor that "Mum" is Sofia. The rehearsals must show the offer both times.

The script does not show the gentle help for a hesitation ("a school?"), the "Another time" buttons, or the fade of an unanswered offer. The Closer can answer about each in the Q&A.

The call in beat 6 reads the due reminder and then the newest moment that Sofia has no story for. When no such moment exists, the call reads only the reminder and says goodbye, so the run ends about 50 seconds earlier. The call skips Maria's moment, because Sofia told her story about it in beat 4. Sofia gives no answer to the reminder, because every word before the share question goes out with her story, and the pills must stay private. Her question comes after the share question, so the question stays out of her story. When Sofia answers "Ask me anything about the family." with "No, thank you", the call goes on to Eleni. A "Yes" posts her words and her voice from the call in the group. "Just the words" posts her words without the voice. A call costs about 0.15 USD per minute, and lasts at most 10 minutes.

## Questions to expect

"Isn't a bot in the family chat annoying?"

- Anchor answers a message that names Anchor, with "Anchor," or with "@anchor_family_bot". A message without "Anchor," gets an answer in two cases only. The first case is a general request, such as "Give me a memory" or "any memories?". The second case is a request for memories or photos of someone or something already in the family record, when the model agrees that it is a request. When Anchor is unsure, it says nothing. It never answers "I didn't understand" to family talk.
- A reply between two people never reaches Anchor.
- In a replay on the live family record on 2026-09-26, 10 of 12 memory requests got the album, and 0 of 14 ordinary messages got an answer, among them photo questions to a person, such as "Can you send me the photos from yesterday?".
- Every offer has an easy no, an unanswered offer fades, and "stop" turns Anchor off for one person.

"Can Anchor make things up?"

- Anchor answers a question only from the family record and the group chat. The answer names who shared the moment and quotes their words, and the photo of that moment follows, so the family sees where the answer came from.
- Code checks every number, name, and quote in the answer against the moments it cites. An answer that fails the check becomes "Here is what the family record says 💛" and the photo.
- In a replay with a record like the demo record, 10 of 10 questions that the record answers got a checked answer with its photo. 9 of 10 questions that the record does not answer, such as "Which school does Maria go to?", got "The family record doesn't say", and the check stopped the tenth, an invented age.

"Is Sofia safe from scams?"

- Sofia forwards a suspicious message to Anchor. When the message uses a family name to ask for money, a code, or bank details, and it did not come from that person's Telegram account, Anchor tells her to call the person on the number she knows, and offers to tell them. Anchor never says that a message is certainly safe or certainly a scam.
- Anchor reads only what Sofia forwards to it.
- In a test on the real model, 6 of 6 scam runs got the warning, and 0 of 6 ordinary requests did, among them "Mum, can you send me the photos from yesterday?".

"What about accessibility?"

- Sofia never needs to read or type: she taps large buttons and answers by voice. A spoken request, such as "What did I miss?", gets the answer of the typed request.
- The voice notes and the call say what each photo shows, without names or judgments, for a member who cannot see the photo well.

## If a beat fails

- No answer only for Sofia in beat 1 after 10 seconds: Sofia writes "Anchor, settings". The same button arrives. Both phrases are decided in code, so a miss here points at the bot or the network, not the model.
- No share offer for Eleni in beat 3 after 15 seconds: check that Sofia turned on "Family moments" in beat 2. Sofia then says "Send me a moment" to Anchor in private, and the photo arrives.
- Sofia's voice answer in beat 4 gets "Thank you 💛" instead of the share question: Anchor closed the invitation. Sofia says "Send me a moment" in private, and repeats beat 4.
- No reminder offer for Sofia in beat 5 after 10 seconds: Eleni writes "Mum, don't forget your pills tomorrow at 8." If no offer comes again, the Narrator tells beats 5 and 6 in one sentence each, and the story continues with the close.
- No reminder after `/fastforward` in beat 6 after 10 seconds: the Narrator tells the reminder, and the story continues.
- Eleni's phone does not ring after "I'm connecting you to Eleni now": after 20 seconds, the group gets "Eleni, Sofia would love a call from you 💛". Eleni says "I'll call you tonight, Mum."
- No ring in beat 6 after 15 seconds: the Narrator says "The phone call is our next step", and the Closer starts the close.
- The call rings, but Anchor stays silent for 5 seconds: Sofia hangs up. The Narrator says "The phone call is our next step", and the Closer starts the close.
- The website does not load in the close: the Operator keeps the phones on the screen, and the Closer says the line with the address.
- Two beats fail: the Operator stops the live demo and plays the screen recording. The speakers say their lines over the recording.

To read what the bot did, run this command after the demo:

```bash
gcloud run services logs read anchor-bot --project=a11y-hack26ath-267 --region=europe-west1 --limit=50
```

## Rehearse twice

Caution: `/fastforward` moves the family clock of the whole bot for good. After a jump, the 11:00 and 18:00 slots fire at other real times, and every new moment shows a date of the demo clock. For that reason, rehearse on the dev bot, and use the live bot for beats 1 to 5 only.

1. Before each rehearsal, do steps 1 and 2 of "Reset and prepare".
2. Run the full script on the dev bot with a stopwatch, and write down the time of each beat.
3. If the run without the call takes more than 4:40, shorten the spoken lines first.
4. After the deploy of the v2 build, run beats 1 to 5 once on the live bot, without beat 6. Then do steps 1 and 2 of "Reset and prepare" again.
5. On the live bot, never run `/fastforward` before the demo. Beat 6 on stage is the only jump.
6. Rehearse the call of beat 6 on the live bot with a reminder in real time, because `/fastforward` stays off the live bot. Eleni replies to Sofia's message with "Mum, remember to take your pills at 10:45", a few minutes ahead, and Sofia taps the offered time. At 10:45, the reminder arrives and the phone rings. The dev bot cannot ring a phone without a public tunnel (`ngrok http 3000`, then `ANCHOR_PUBLIC_URL` in `apps/api/.env.local`).
