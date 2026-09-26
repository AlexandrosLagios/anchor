/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_PRIVACY_EMAIL?: string;
  readonly PUBLIC_DATA_REGION?: string;
  readonly PUBLIC_SITE_URL?: string;
  /** BotFather Login Widget Client ID for the Telegram bot that owns this site. */
  readonly PUBLIC_TELEGRAM_CLIENT_ID?: string;
  /** e.g. https://anchor-bot-tl7qfnc7aq-ew.a.run.app — only destination for the id_token */
  readonly PUBLIC_BOT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
