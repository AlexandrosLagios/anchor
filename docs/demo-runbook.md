# Demo runbook: Anchor live in a family group

The live demo takes 2 to 3 minutes of the 6-minute presentation. It walks the demo loop of the user stories: the daughter shares a moment, the grandfather agrees to Anchor himself, the moment comes back, he hesitates and gets gentle help, and he answers by voice.

The demo runs against the live bot `@anchor_family_bot` on Cloud Run (`DEPLOY.md`). Every line and every staged message is in English.

## Cast

| Role | Who | Screen |
| --- | --- | --- |
| Eleni, the daughter | Teammate 1, a group admin | The family group |
| The grandfather | Teammate 2 | The private chat with Anchor |
| Presenter | Teammate 3 | Narrates, and shows both screens side by side |

Anchor takes every name from Telegram. Set the first name of each demo account to its role name before the demo, for example "Eleni" and "Nikos".

## Before the demo

Check the bot and the group:

1. Make sure that the live bot runs `main` at `3d96948` or later, which has `/private` and `/send`. If it does not, redeploy with `DEPLOY.md` steps 1 to 3.
2. Use the group of the rehearsals. A person is a storyteller in one family only, so a new group sends the grandfather's private replies to the old family.
3. Make sure that Anchor is an admin in the group. Promote Anchor at least one day before, because a move to a supergroup posts `intro` a second time.
4. Turn "Remain anonymous" off for Eleni. Anchor ignores commands from an anonymous admin.

Reset and prepare, before the demo and before each rehearsal:

1. Remove the moments of the rehearsals. Reply "Anchor, forget this" to each rehearsal photo.
2. Let the grandfather send "stop" to Anchor in private, so that he can agree again on stage.
3. Let the grandfather post one message in the group, for example "Good morning everyone 🙂". Eleni replies to this message in beat 2.
4. Put these files on the phones: a staged photo of a child's first day at school on Eleni's phone, and a photo from 1958 on the grandfather's phone.
5. Keep a screen recording of the best rehearsal ready. Play the recording if the live bot fails.

## The script

Each beat names the user story it shows, the action, and what the audience sees. The times include about 5 seconds of model latency per beat, so the presenter narrates while Anchor works.

| Beat | Time | Story | Who | Action | The audience sees |
| --- | --- | --- | --- | --- | --- |
| 1 | 0:00 | 2. Keep what I share | Eleni | Post the photo with the caption "Maria's first day of school! She wore her new red backpack." | Anchor reacts with ❤. Nobody pressed a button, and Anchor keeps the moment with Eleni's words and name. |
| 2 | 0:25 | 1. Say yes myself | Eleni | Reply `/private` to the grandfather's message. | Anchor posts "Nikos, the family would love your stories 💛" with a Start button. |
| 3 | 0:40 | 1. Say yes myself | Grandfather | Tap Start, then Start in the private chat. Read the welcome aloud, then tap "Yes, I'd like that". | In plain words, Anchor says that it is not a person, that there is no right answer, that it shares nothing without a yes, and that /stop ends it at any time. After the tap: "Wonderful, Nikos 💛 I'll send you the first moment soon." Nothing comes before he agrees. |
| 4 | 1:05 | 3. Hold on to family moments | Eleni | Send `/send` in the group. | In private, the grandfather gets the photo, then a voice note: "Eleni shared: «Maria's first day of school! …» What does it remind you of?" It is Eleni's words, attributed to her, and an invitation with no right answer. |
| 5 | 1:25 | 4. Stay confident | Grandfather | Reply "a school?" | "No rush 🙂 This is from …: Maria's first day of school. Any memory it brings is welcome." There is no correction. The presenter points at the group screen: nothing shows there. |
| 6 | 1:45 | 6. Respond without typing | Grandfather | Record a voice note of about 10 seconds: "My first day was in 1958. My mother walked me to the village school, and I cried at the gate." | "Thank you for the story 💛 Shall I share it with the family?" with "Yes, share it" and "No, thanks". |
| 7 | 2:10 | 6. Respond without typing | Grandfather | Tap "Yes, share it". | In the group: "Nikos added a story to Eleni's moment 🎙️", as a reply to Eleni's photo, with his words quoted, his voice note, and a big ❤. His story is now part of the memory. |
| 8 | 2:30 | | Presenter | Close: "Eleni shared a moment. Her father agreed himself, got help without a correction, and added his story by voice." | Both screens stay on the group. |

Beat 5 has a second path for story 5, "Just ask". Choose one path before the rehearsals:

- "a school?" shows story 4: gentle help for a hesitation.
- The "What is this?" button shows story 5: "This is Maria's first day of school, from …. Eleni shared it 💛", a direct and warm answer with no hint that he should have known.

The script does not show the second criterion of story 1 (he can stop at any time) or the no-reply path of story 4. The welcome in beat 3 names /stop, and the presenter can say one sentence about each.

Optional beat, only when the clock shows less than 2:30 after beat 7: the grandfather posts his 1958 photo in the group with the caption "My first day of school, 1958". Anchor posts a "Then and now" album of the two photos.

## If a beat fails

- No ❤ after 15 seconds: narrate beat 1 and continue with beat 2. The photo still counts once the classification finishes.
- No private message after `/send`: check that the grandfather tapped "Yes, I'd like that" in beat 3, then send `/send` again.
- A voice note arrives late: continue the narration. The text caption says the same words.
- Two beats fail: stop the live demo and play the screen recording.

To read what the bot did, run this command after the demo:

```bash
gcloud run services logs read anchor-bot --project=a11y-hack26ath-267 --region=europe-west1 --limit=50
```

## Rehearse twice

1. Before each rehearsal, do steps 1 and 2 of "Reset and prepare".
2. Run the script with a stopwatch, and write down the time of each beat.
3. If the run takes more than 3 minutes, cut the optional beat, then shorten the narration.
