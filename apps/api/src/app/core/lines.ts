/** Cuts the text to at most `max` UTF-16 units, the unit of the Telegram limits, and never inside an emoji. */
export function cut(text: string, max: number): string {
  if (text.length <= max) return text;
  let kept = '';
  for (const { segment } of new Intl.Segmenter().segment(text)) {
    if (kept.length + segment.length > max) break;
    kept += segment;
  }
  return kept;
}

// keeps a memory caption under the Telegram limit of 1024 characters and the invitation voice note short
const clip = (text: string) => (text.length > 600 ? `${cut(text, 599)}…` : text);

export const lines = {
  intro:
    "Hi, I'm Anchor 👋 I'm not a person: I keep this family's photos and stories, each one in the words of the person who shared it. " +
    'When someone shares a moment worth keeping, I save it and react with ❤. Now and then I bring a moment back, so it stays with all of us. ' +
    "An admin can reply /storyteller to a grandparent's message. " +
    'Reply "Anchor, forget this" to delete a moment, or "Anchor, don\'t bring this back" to keep it without bringing it back. ' +
    'This is a test build, so please share staged photos only.',
  storytellerStart: (name: string) =>
    `${name}, the family would love your stories 💛 Tap Start, and now and then I'll send you a family moment.`,
  welcome: (name: string) =>
    `Hello ${name} 🙂 I'm Anchor. I keep your family's photos and stories, and I'm not a person. ` +
    "Now and then, and a little more often for you, I'll send you a moment the family shared. " +
    'Seeing moments again helps them stay with us. Tell me what it brings back, by voice or by text. ' +
    "There's no right answer, and I share nothing unless you say yes.",
  invitation: (sender: string, text: string) => `${sender} shared: «${clip(text)}»\nWhat does it remind you of?`,
  memoryCaption: (label: string, sender: string, text: string) =>
    `${label} 💛\n${sender} shared: «${clip(text)}»\nReply with a story or a voice note to add it to the family record.`,
  labels: {
    '7': 'One week ago',
    '30': 'One month ago',
    '365': 'One year ago',
    anniversary: (year: number) => `On this day in ${year}`,
    fromRecord: 'From the family record',
  },
  gentleHelp: (date: string, title: string) => `No rush 🙂 This is from ${date}: ${title}. Any memory it brings is welcome.`,
  warmClose: 'Thank you 💛',
  thanks: 'Thank you for the story 💛 Shall I share it with the family?',
  shared: 'Done, the family can hear it now 💛',
  notShared: "Of course. I won't share it.",
  notNow: 'No problem 🙂 Another time.',
  dontBringBack: "Of course. I'll keep it, and I won't bring it back.",
  storyAdded: (name: string) => `${name} added a story to this moment 🎙️`,
  askAnswer: (title: string, date: string, names: string[]) =>
    `${title} · ${date} 💛${names.length ? `\nStories from ${names.join(', ')}` : ''}`,
  notFound: "I couldn't find that in the family record yet.",
  noInvitation: "Thank you 🙂 I'll bring you a family moment soon.",
  pointer: "Hi! I keep your family's record. Talk to me in your family group 🙂",
  voiceNote: '🎤 voice note',
  nothingToShare: 'The family record is empty so far. Share a photo with a few words 🙂',
  nothingToInvite: (name: string) => `${name} has seen every moment so far.`,
  buttons: {
    start: 'Start',
    notNow: 'Not now',
    dontBringBack: "Don't bring this back",
    share: 'Yes, share it',
    dontShare: 'No, thanks',
  },
};
