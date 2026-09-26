export const privacyEmail =
  import.meta.env.PUBLIC_PRIVACY_EMAIL?.trim() || 'privacy@anchor.com';

/** Telegram Login Client ID from BotFather (Login Widget). Audience of the id_token. Defaults to @anchor_family_bot. */
export const telegramClientId = (import.meta.env.PUBLIC_TELEGRAM_CLIENT_ID?.trim() || '8957920956').replace(/\D/g, '');

/** Cloud Run bot that holds the family record. id_token is sent only here. */
export const botOrigin = (
  import.meta.env.PUBLIC_BOT_URL?.trim() || 'https://anchor-bot-tl7qfnc7aq-ew.a.run.app'
).replace(/\/$/, '');

export const botOpenLink = 'https://t.me/anchor_family_bot';

/** Opens Telegram’s group picker and adds Anchor as an admin. */
export const botAddLink = 'https://t.me/anchor_family_bot?startgroup&admin=delete_messages';

/** Optional WhatsApp chat to invite Anchor (Twilio sandbox by default). */
export const whatsappAddLink =
  import.meta.env.PUBLIC_WHATSAPP_ADD_LINK?.trim() ||
  'https://wa.me/14155238886?text=join%20anchor';

/** Optional Viber public-account chat. Empty means the button is shown as unavailable. */
export const viberAddLink = import.meta.env.PUBLIC_VIBER_ADD_LINK?.trim() || '';

export function botUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${botOrigin}${normalized}`;
}
