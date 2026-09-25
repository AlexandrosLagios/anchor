import { expect, test } from 'vitest';
import { lines } from './lines';
import type { Moment } from './types';

const sofia = { id: '1', name: 'Sofia' };
const nikos = { id: '2', name: 'Nikos' };

function moment(fields: Partial<Moment> = {}): Moment {
  return {
    id: 'm1',
    by: sofia,
    messageIds: [],
    savedAt: 0,
    text: 'Maria on her first day',
    salience: 3,
    sensitive: false,
    people: [],
    title: "Maria's first day at school",
    stories: [],
    lookbacks: [],
    memoryPostIds: [],
    returns: {},
    ...fields,
  };
}

const wordless = (fields: Partial<Moment> = {}) => moment({ text: "Maria's first day at school", wordless: true, ...fields });

test('sharedBy quotes the sharer, and names a wordless photo, video, or voice note with its title and no quote marks', () => {
  expect(lines.sharedBy(moment())).toBe('Sofia shared: «Maria on her first day»');
  expect(lines.sharedBy(wordless({ photo: { id: 'p1' } }))).toBe("Sofia shared a photo: Maria's first day at school");
  expect(lines.sharedBy(wordless({ photo: { id: 'p1' }, video: { id: 'v1' } }))).toBe("Sofia shared a video: Maria's first day at school");
  expect(lines.sharedBy(wordless({ voice: { id: 'a1' } }))).toBe("Sofia shared a voice note: Maria's first day at school");
  expect(lines.sharedBy(wordless({ photo: { id: 'p1' }, voice: { id: 'a1' } }))).toBe("Sofia shared a photo: Maria's first day at school");
});

test('a moment with words keeps the quoting lines byte for byte', () => {
  expect(lines.memoryCaption('One week ago', moment())).toBe(
    'One week ago 💛\nSofia shared: «Maria on her first day»\nReply with a story or a voice note to add it to the family record.',
  );
  expect(lines.invitation(moment())).toBe('Sofia shared: «Maria on her first day»\nWhat does it remind you of?');
  expect(lines.echoCaption(moment({ by: nikos, text: 'My first day, 1958' }), moment())).toBe(
    'Then and now 💛\nNikos shared: «My first day, 1958»\nSofia shared: «Maria on her first day»',
  );
});

test('a wordless photo goes through memoryCaption, invitation, and echoCaption with the photo phrase and no quote mark', () => {
  const photo = wordless({ photo: { id: 'p1' } });
  const outputs = [
    lines.memoryCaption('One week ago', photo),
    lines.invitation(photo),
    lines.echoCaption(photo, wordless({ by: nikos, video: { id: 'v1' } })),
  ];
  for (const output of outputs) {
    expect(output).toContain("Sofia shared a photo: Maria's first day at school");
    expect(output).not.toMatch(/[«»]/);
  }
});

test('invitation and memoryCaption clip a long quote to 600 characters that end with …', () => {
  const long = moment({ text: 'a'.repeat(2000) });
  const clip = `«${'a'.repeat(599)}…»`;
  expect(lines.invitation(long)).toContain(clip);
  expect(lines.memoryCaption('One week ago', long)).toContain(clip);
  expect(lines.invitation(moment({ text: 'b'.repeat(600) }))).toContain(`«${'b'.repeat(600)}»`);
});

test('storyAdded clips its quote to 600 characters', () => {
  expect(lines.storyAdded('Nikos', 'Sofia', 'a'.repeat(2000))).toContain(`«${'a'.repeat(599)}…»`);
});

test('echoCaption clips each quote to 450 characters, so the caption stays under 1024 with both quotes closed', () => {
  const echo = lines.echoCaption(moment({ by: nikos, text: 'a'.repeat(2000) }), moment({ text: 'b'.repeat(2000) }));
  expect(echo).toContain(`«${'a'.repeat(449)}…»`);
  expect(echo).toContain(`«${'b'.repeat(449)}…»`);
  expect(echo.length).toBeLessThan(1024);
  expect(echo.endsWith('…»')).toBe(true);
});

test('the clip keeps whole emoji and stays inside 600 UTF-16 units', () => {
  expect(lines.invitation(moment({ text: `${'a'.repeat(597)}😀😀😀` }))).toContain(`«${'a'.repeat(597)}😀…»`);
  expect(lines.invitation(moment({ text: `${'a'.repeat(597)}👨‍👩‍👧 end` }))).toContain(`«${'a'.repeat(597)}…»`);
  expect(lines.invitation(moment({ text: `${'a'.repeat(596)}🇬🇷🇬🇷` }))).toContain(`«${'a'.repeat(596)}…»`);
  expect(lines.memoryCaption('One week ago', moment({ text: '😀'.repeat(700) }))).toContain(`«${'😀'.repeat(299)}…»`);
});

test('the consent, stop, and just-ask lines read as the design writes them', () => {
  expect(lines.welcome('Nikos')).toBe(
    "Hello Nikos 🙂 I'm Anchor. I'm not a person: I keep your family's photos and stories. " +
      "Now and then, and a little more often for you, I'll send you a moment the family shared. " +
      'Seeing moments again helps them stay with us. You can answer by voice or by text. ' +
      "There's no right answer, I share nothing unless you say yes, and you can send /stop at any time. Would you like that?",
  );
  expect(lines.agreed('Nikos')).toBe("Wonderful, Nikos 💛 I'll send you the first moment soon.");
  expect(lines.stopped).toBe("Of course. I won't send you any more moments. If you'd like them again, send /start.");
  expect(lines.tellDirectly("Maria's first day at school", '25 September 2026', 'Sofia')).toBe(
    "This is Maria's first day at school, from 25 September 2026. Sofia shared it 💛",
  );
  expect(lines.buttons.agree).toBe("Yes, I'd like that");
  expect(lines.buttons.whatIsThis).toBe('What is this?');
});

test('the v2 reminder and call lines read as the design writes them', () => {
  expect(lines.reminderOffer('You', 'take my pills')).toBe('⏰ You wrote: «take my pills»\nShall I remind you?');
  expect(lines.reminderOffer('Sofia', 'a'.repeat(2000))).toContain(`«${'a'.repeat(599)}…»`);
  expect(lines.reminderSet('08:00')).toBe("Done ✍ I'll remind you at 08:00 in our private chat.");
  expect(lines.reminderStart('08:00')).toBe("Tap Start, and I'll remind you at 08:00 in our private chat 🙂");
  expect(lines.reminderConfirmed('08:00')).toBe("Done ✍ I'll remind you here at 08:00.");
  expect(lines.reminder('Sofia', 'take my pills')).toBe('⏰ Your reminder. Sofia wrote: «take my pills»');
  expect(lines.fastforwardUsage).toBe('Send /fastforward and a number of days or a time, for example /fastforward 7 or /fastforward 08:05.');
  expect(lines.call.opening('Nikos')).toBe("Hello Nikos, this is Anchor, the family's record keeper. I'm not a person.");
  expect(lines.call.askShare).toBe('Shall I share what you told me with the family?');
  expect(lines.call.reachPerson('Sofia')).toBe("Shall I tell Sofia you'd love a call?");
  expect(lines.call.goodbye('Nikos')).toBe('Thank you, Nikos. Goodbye 💛');
  expect(lines.wouldLoveCall('Nikos', 'Sofia')).toBe('Sofia, Nikos would love a call from you 💛');
  expect(lines.buttons.remindAt('08:00')).toBe('Yes, at 08:00');
  expect(lines.buttons.anotherTime).toBe('Another time');
  expect(lines.buttons.noThanks).toBe('No thanks');
  expect(lines.buttons.stopReminders).toBe('Stop offering reminders');
});
