import { ForbiddenException, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import { createPublicKey, type JsonWebKey } from 'node:crypto';
import { lines } from './core/lines';
import type { Context, Family, Person } from './core/types';
import { showChoices } from './features/members';
import { unlog } from './features/talk';
import { httpFetch } from './http';

const logger = new Logger('Web');

const ISSUER = 'https://oauth.telegram.org';

let keys: JsonWebKey[] = [];

// ponytail: a token with an unknown kid fetches the keys again, so a bogus kid costs one fetch; add a cooldown if that gets abused
async function signingKey(kid: unknown) {
  if (!keys.some((key) => key.kid === kid)) {
    const response = await httpFetch(`${ISSUER}/.well-known/jwks.json`, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`The Telegram keys answered ${response.status}`);
    keys = ((await response.json()) as { keys: JsonWebKey[] }).keys;
  }
  const key = keys.find((item) => item.kid === kid);
  if (!key) throw new Error(`Telegram has no key ${kid}`);
  return createPublicKey({ key, format: 'jwk' });
}

// Telegram Login (https://core.telegram.org/widgets/login): an OpenID Connect id_token whose audience is the bot id and whose id claim is the Telegram user id
export async function verifyIdToken(authorization: string | undefined, botId: string): Promise<Person> {
  const token = authorization?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) throw new UnauthorizedException('Sign in with Telegram');
  try {
    const key = await signingKey(jwt.decode(token, { complete: true })?.header.kid);
    // the pattern matches the audience as a string or as a number
    const claims = jwt.verify(token, key, { algorithms: ['RS256', 'ES256'], issuer: ISSUER, audience: new RegExp(`^${botId}$`) }) as jwt.JwtPayload;
    if (claims.id === undefined) throw new Error('The token has no id claim');
    return { id: String(claims.id), name: String(claims.given_name || claims.name || '') };
  } catch (error) {
    logger.warn(`A Telegram id_token failed the check: ${error instanceof Error ? error.message : error}`);
    throw new UnauthorizedException('Sign in with Telegram again');
  }
}

async function inGroup(family: Family, userId: string, ctx: Context): Promise<boolean> {
  try {
    return await ctx.transport(family.id).isMember(family.chatId, userId);
  } catch (error) {
    logger.warn(`The membership check of ${userId} failed: ${error}`);
    return false;
  }
}

const person = ({ id, name }: Person): Person => ({ id, name });

const iso = (ms: number) => new Date(ms).toISOString();

const inRecord = (family: Family, userId: string) => family.members.some((member) => member.id === userId);

// the family view is only for a person who is in the record and in the group now
async function familyOf(user: Person, ctx: Context): Promise<Family> {
  for (const family of ctx.store.state.families) if (inRecord(family, user.id) && (await inGroup(family, user.id, ctx))) return family;
  throw new ForbiddenException('Join your family group, then sign in again');
}

// the data rights reach every family of the person, also a family whose group the person left
function recordsOf(user: Person, ctx: Context): Family[] {
  const families = ctx.store.state.families.filter((family) => inRecord(family, user.id));
  if (!families.length) throw new ForbiddenException('Anchor has no record of you');
  return families;
}

// the website sends a person to join on every visit, so only a member who has not started gets the choices in private
export async function join(user: Person, ctx: Context, addLink: string) {
  // the families of the record come first, in the order that familyOf reads them
  const families = [...ctx.store.state.families].sort((a, b) => Number(inRecord(b, user.id)) - Number(inRecord(a, user.id)));
  for (const family of families) {
    if (!(await inGroup(family, user.id, ctx))) continue;
    const member = ctx.store.joinMember(family, user);
    if (!member.started) {
      member.started = true;
      ctx.store.save();
      await showChoices(family, member, lines.welcome(member.name), ctx);
    }
    return { status: 'joined' as const, family: { members: family.members.map(person) } };
  }
  return { status: 'no-family' as const, addLink };
}

export async function me(user: Person, ctx: Context) {
  const family = await familyOf(user, ctx);
  return { member: person(family.members.find((member) => member.id === user.id) ?? user), family: { members: family.members.map(person) } };
}

export async function moments(user: Person, ctx: Context) {
  const family = await familyOf(user, ctx);
  return family.moments
    .filter((moment) => !moment.sensitive)
    .sort((a, b) => b.savedAt - a.savedAt)
    .map((moment) => ({
      id: moment.id,
      by: person(moment.by),
      savedAt: iso(moment.savedAt),
      title: moment.title,
      text: moment.text,
      ...(moment.eventDate && { eventDate: moment.eventDate }),
      hasPhoto: Boolean(moment.photo),
      hasVoice: Boolean(moment.voice),
      stories: moment.stories.map((story) => ({ id: story.id, by: person(story.by), at: iso(story.at), text: story.text, hasVoice: Boolean(story.voice) })),
    }));
}

// the file streams through the bot, because a Telegram file URL carries the bot token
export async function media(user: Person, ctx: Context, momentId: string, kind: 'photo' | 'voice') {
  const family = await familyOf(user, ctx);
  const file = family.moments.find((moment) => moment.id === momentId && !moment.sensitive)?.[kind];
  if (!file) throw new NotFoundException('The moment has no such file');
  return ctx.transport(family.id).download(file);
}

export function myData(user: Person, ctx: Context) {
  return {
    families: recordsOf(user, ctx).map((family) => ({
      member: family.members.find((member) => member.id === user.id),
      moments: family.moments.filter((moment) => moment.by.id === user.id),
      stories: family.moments.flatMap((moment) => moment.stories.filter((story) => story.by.id === user.id).map((story) => ({ momentId: moment.id, ...story }))),
      reminders: family.reminders.filter((reminder) => reminder.to === user.id),
    })),
  };
}

// Telegram keeps the group messages; this removes what Anchor holds about the person
export function deleteMyData(user: Person, ctx: Context) {
  for (const family of recordsOf(user, ctx)) {
    const name = family.members.find((member) => member.id === user.id)?.name;
    unlog(family, family.moments.filter((moment) => moment.by.id === user.id).flatMap((moment) => moment.messageIds));
    family.moments = family.moments.filter((moment) => moment.by.id !== user.id);
    for (const moment of family.moments) {
      moment.stories = moment.stories.filter((story) => story.by.id !== user.id);
      delete moment.returns[user.id];
    }
    family.members = family.members.filter((member) => member.id !== user.id);
    family.reminders = family.reminders.filter((reminder) => reminder.to !== user.id);
    family.offers = family.offers.filter((offer) => offer.to !== user.id);
    // ponytail: a chat line keeps only the name, so the lines of a namesake go too; add the sender id to ChatLine when that matters
    if (family.chat) family.chat = family.chat.filter((line) => line.by !== name);
  }
  ctx.store.save();
}
