import { Logger } from '@nestjs/common';
import { Blocked, type Context, type Family, type Media, type Member, type Outgoing } from './types';

const logger = new Logger('Tell');

// v2, section 4.14: every private line goes through tell; the voice path lands in step 5
export async function tell(
  family: Family,
  member: Member,
  message: Outgoing,
  ctx: Context,
): Promise<{ messageId: string; voice?: Media } | undefined> {
  try {
    return await ctx.transport(family.id).send(member.id, message);
  } catch (error) {
    if (error instanceof Blocked) {
      member.started = false;
      ctx.store.save();
    } else {
      logger.warn(`A message to member ${member.id} failed: ${error}`);
    }
    return undefined;
  }
}
