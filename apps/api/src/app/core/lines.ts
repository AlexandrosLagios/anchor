import type { Moment } from './types';

const graphemes = new Intl.Segmenter();

/** Cuts the text to at most `max` UTF-16 units, the unit of the Telegram limits, and never inside an emoji. */
export function cut(text: string, max: number): string {
  if (text.length <= max) return text;
  let kept = '';
  for (const { segment } of graphemes.segment(text)) {
    if (kept.length + segment.length > max) break;
    kept += segment;
  }
  return kept;
}

// keeps every caption under the Telegram limit of 1024 characters and the invitation voice note short
const clip = (text: string, max = 600) => (text.length > max ? `${cut(text, max - 1)}…` : text);

export function dateOf(moment: Moment): string {
  const date = moment.eventDate ? new Date(`${moment.eventDate}T12:00`) : new Date(moment.savedAt);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

// a wordless moment names what was shared, so the model's title never reads as the sharer's words
function sharedBy(moment: Moment, max = 600): string {
  if (!moment.wordless) return `${moment.by.name} shared: «${clip(moment.text, max)}»`;
  const kind = moment.video ? 'a video' : !moment.photo && moment.voice ? 'a voice note' : 'a photo';
  return `${moment.by.name} shared ${kind}: ${moment.title}`;
}

export const lines = {
  intro:
    "Hi, I'm Anchor 👋 I'm not a person: I keep this family's photos and stories, each one in the words of the person who shared it. " +
    'When someone shares a moment worth keeping, I save it and react with ❤. Now and then I bring a moment back, so it stays with all of us. ' +
    "An admin can reply /private to a grandparent's message, and I'll send them family moments in private. " +
    'Reply "Anchor, forget this" to delete a moment, or "Anchor, don\'t bring this back" to keep it without bringing it back. ' +
    'This is a test build, so please share staged photos only.',
  memberStart: (name: string) =>
    `${name}, the family would love your stories 💛 Tap Start, and now and then I'll send you a family moment.`,
  welcome: (name: string) =>
    `Hello ${name} 🙂 I'm Anchor. I'm not a person: I keep your family's photos and stories. ` +
    "Now and then, and a little more often for you, I'll send you a moment the family shared. " +
    'Seeing moments again helps them stay with us. You can answer by voice or by text. ' +
    "There's no right answer, I share nothing unless you say yes, and you can send /stop at any time. Would you like that?",
  sharedBy,
  invitation: (moment: Moment) => `${sharedBy(moment)}\nWhat does it remind you of?`,
  memoryCaption: (label: string, moment: Moment) =>
    `${label} 💛\n${sharedBy(moment)}\nReply with a story or a voice note to add it to the family record.`,
  labels: {
    '7': 'One week ago',
    '30': 'One month ago',
    '365': 'One year ago',
    anniversary: (year: number) => `On this day in ${year}`,
    fromRecord: 'From the family record',
  },
  gentleHelp: (date: string, title: string) => `No rush 🙂 This is from ${date}: ${title}. Any memory it brings is welcome.`,
  warmClose: 'Thank you 💛',
  agreed: (name: string) => `Wonderful, ${name} 💛 I'll send you the first moment soon.`,
  stopped: "Of course. I won't send you any more moments. If you'd like them again, send /start.",
  tellDirectly: (title: string, date: string, sender: string) => `This is ${title}, from ${date}. ${sender} shared it 💛`,
  thanks: 'Thank you for the story 💛 Shall I share it with the family?',
  shared: 'Done, the family can hear it now 💛',
  notShared: "Of course. I won't share it.",
  notNow: 'No problem 🙂 Another time.',
  dontBringBack: "Of course. I'll keep it, and I won't bring it back.",
  storyAdded: (name: string, sender: string, story: string) => `${name} added a story to ${sender}'s moment 🎙️\n«${clip(story)}»`,
  echoCaption: (then: Moment, now: Moment) => `Then and now 💛\n${sharedBy(then, 450)}\n${sharedBy(now, 450)}`,
  fastforwarded: (date: string) => `⏩ It's now ${date} on the family clock.`,
  // v2, section 4.13: who is "You" when the sender gets the reminder
  reminderOffer: (who: string, text: string) => `⏰ ${who} wrote: «${clip(text)}»\nShall I remind you?`,
  reminderSet: (time: string) => `Done ✍ I'll remind you at ${time} in our private chat.`,
  reminderStart: (time: string) => `Tap Start, and I'll remind you at ${time} in our private chat 🙂`,
  reminderConfirmed: (time: string) => `Done ✍ I'll remind you here at ${time}.`,
  reminder: (who: string, text: string) => `⏰ Your reminder. ${who} wrote: «${clip(text)}»`,
  fastforwardUsage: 'Send /fastforward and a number of days or a time, for example /fastforward 7 or /fastforward 08:05.',
  // v2, section 4.15: the phone call
  call: {
    opening: (name: string) => `Hello ${name}, this is Anchor, the family's record keeper. I'm not a person.`,
    askShare: 'Shall I share what you told me with the family?',
    reachPerson: (sender: string) => `Shall I tell ${sender} you'd love a call?`,
    goodbye: (name: string) => `Thank you, ${name}. Goodbye 💛`,
  },
  wouldLoveCall: (name: string, sender: string) => `${sender}, ${name} would love a call from you 💛`,
  askAnswer: (title: string, date: string, names: string[]) =>
    `${title} · ${date} 💛${names.length ? `\nStories from ${names.join(', ')}` : ''}`,
  notFound: "I couldn't find that in the family record yet.",
  noInvitation: "Thank you 🙂 I'll bring you a family moment soon.",
  notJoined: "Thank you 🙂 If you'd like family moments from me, send /start.",
  pointer: "Hi! I keep your family's record. Talk to me in your family group 🙂",
  forgetWhich: 'This post shows two moments. Which one should I forget?',
  quietWhich: 'This post shows two moments. Which one should I stop bringing back?',
  whichMoment: (moment: Moment) => clip(`${moment.by.name}: ${moment.title}`, 40),
  voiceNote: '🎤 voice note',
  nothingToShare: 'The family record is empty so far. Share a photo with a few words 🙂',
  nothingToInvite: (name: string) => `${name} has seen every moment so far.`,
  adminOnly: 'Only a group admin can do that 🙂',
  privateHow: 'Reply /private to a message from the person who should get family moments in private.',
  nobodyPrivate: "Nobody gets family moments in private yet. Reply /private to a grandparent's message first.",
  // the menu that Telegram shows when someone types "/"; an admin sees only the admin list, so it repeats /memory
  commands: {
    group: [{ command: 'memory', description: 'Share a family memory in the group now' }],
    admins: [
      { command: 'memory', description: 'Share a family memory in the group now' },
      { command: 'private', description: 'Reply to a message: that person gets family moments in private' },
      { command: 'send', description: 'Send a family moment now to each person who gets them in private' },
      { command: 'fastforward', description: 'Move the family clock forward, for example /fastforward 7' },
    ],
    private: [
      { command: 'start', description: 'Get family moments from me' },
      { command: 'stop', description: 'Stop getting family moments' },
    ],
  },
  buttons: {
    start: 'Start',
    agree: "Yes, I'd like that",
    notNow: 'Not now',
    dontBringBack: "Don't bring this back",
    whatIsThis: 'What is this?',
    share: 'Yes, share it',
    dontShare: 'No, thanks',
    // v2, section 4.13: the reminder offer buttons
    remindAt: (time: string) => `Yes, at ${time}`,
    anotherTime: 'Another time',
    noThanks: 'No thanks',
    stopReminders: 'Stop offering reminders',
  },
};
