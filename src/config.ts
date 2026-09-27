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

export const DRAW_INTERVAL_DAYS = 5;
// Draws fall on this JST date and every DRAW_INTERVAL_DAYS days from it (before
// or after). Changing it shifts every future draw date and orphans entries
// already registered for the old next draw date.
export const DRAW_CYCLE_ANCHOR = "2026-09-29";
