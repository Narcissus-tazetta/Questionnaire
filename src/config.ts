export interface Env {
  DB: D1Database;
  DRAW_SCHEDULER: DurableObjectNamespace;
  DISCORD_TOKEN: string;
  DISCORD_PUBLIC_KEY: string;
  DISCORD_APP_ID: string;
  GUILD_ID: string;
}

export const TIMEZONE = "Asia/Tokyo";
export const DISCORD_API = "https://discord.com/api/v10";
