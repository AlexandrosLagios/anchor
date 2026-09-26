import { cut, dateOf, lines } from '../core/lines';
import type { Context, Family, Member, Moment } from '../core/types';
import { pictureOf } from './capture/filter';
import { answer } from './talk';

// section 6.4/6.7: the per-moment prompt line, one per non-sensitive moment
export function choiceLine(moment: Moment) {
  const stories = moment.stories.map((story) => cut(story.text, 200)).join(' | ');
  const people = moment.people.join(', ');
  const picture = moment.description ? `, picture: ${moment.description}` : '';
  return `- id ${moment.id}: "${moment.title}", ${dateOf(moment)}, people: ${people}, tags: ${(moment.tags ?? []).join(', ')}${picture}, stories: ${stories}`;
}

// answers a group question, or the `find` intent, with a moment: the video or the photo with the checked answer as the caption, or askAnswer when the
// answer fails, as a reply, then the first voice story; every post id lands in memoryPostIds
export async function answerInGroup(family: Family, moment: Moment, replyTo: string, ctx: Context, member: Member, question: string): Promise<void> {
  const names = [...new Set(moment.stories.map((story) => story.by.name))];
  const reply = await answer(family, member, question, ctx, 'group', moment);
  const text = reply?.grounded
    ? cut(`${reply.text}${names.length ? `\nStories from ${names.join(', ')}` : ''}`, 1024)
    : lines.askAnswer(moment.title, dateOf(moment), names);
  const { messageId } = await ctx.transport(family.id).send(family.chatId, { ...pictureOf(moment), text, replyTo });
  moment.memoryPostIds.push(messageId);

  const voiceStory = moment.stories.find((story) => story.voice);
  if (voiceStory) {
    const voiceSent = await ctx.transport(family.id).send(family.chatId, { voice: voiceStory.voice });
    moment.memoryPostIds.push(voiceSent.messageId);
  }
  ctx.store.save();
}
