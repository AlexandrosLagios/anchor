import type { Context, Family, Feature, Member, Reminder } from '../core/types';

// ponytail: step 7 lands the phone call of section 4.15 and replaces this stub
export const calls: Feature = { name: 'calls' };

export async function callMember(family: Family, member: Member, ctx: Context, reminder?: Reminder): Promise<boolean> {
  return false;
}
