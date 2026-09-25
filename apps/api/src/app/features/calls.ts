import type { Context, Family, Feature, Member, Reminder } from '../core/types';

export const calls: Feature = { name: 'calls' };

// ponytail: always returns false until step 7 lands the phone call of section 4.15 and replaces this stub
export async function callMember(family: Family, member: Member, ctx: Context, reminder?: Reminder): Promise<boolean> {
  return false;
}
