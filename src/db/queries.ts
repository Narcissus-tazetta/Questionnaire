import { nowISO } from "../util/jst";

export interface GuildConfig {
  guild_id: string;
  draw_time: string;
  timezone: string;
  role_id: string;
  channel_id: string;
  work_channel_id: string | null;
}

export interface DailyResult {
  guild_id: string;
  date: string;
  winner_id: string | null;
  drawn_at: string;
  type: "normal" | "manual" | "reroll" | "carryover";
  message_id: string | null;
}

type ResultRecord = Omit<DailyResult, "drawn_at" | "message_id">;

export async function getConfig(db: D1Database, guildId: string): Promise<GuildConfig | null> {
  return db
    .prepare("SELECT * FROM guild_config WHERE guild_id = ?")
    .bind(guildId)
    .first<GuildConfig>();
}

export async function upsertConfig(
  db: D1Database,
  cfg: Omit<GuildConfig, "timezone">,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO guild_config (guild_id, draw_time, role_id, channel_id, work_channel_id)
       VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(guild_id) DO UPDATE SET
         draw_time = excluded.draw_time,
         role_id = excluded.role_id,
         channel_id = excluded.channel_id,
         work_channel_id = excluded.work_channel_id`,
    )
    .bind(cfg.guild_id, cfg.draw_time, cfg.role_id, cfg.channel_id, cfg.work_channel_id)
    .run();
}

/* ---------- per-day entries ---------- */

export async function hasDailyEntry(
  db: D1Database,
  guildId: string,
  date: string,
  userId: string,
): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS x FROM daily_entries WHERE guild_id = ? AND date = ? AND user_id = ?")
    .bind(guildId, date, userId)
    .first<{ x: number }>();
  return row !== null;
}

/** Returns false when the row already existed. */
export async function addDailyEntry(
  db: D1Database,
  guildId: string,
  date: string,
  userId: string,
): Promise<boolean> {
  const res = await db
    .prepare(
      `INSERT OR IGNORE INTO daily_entries (guild_id, date, user_id, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(guildId, date, userId, nowISO())
    .run();
  return (res.meta.changes ?? 0) > 0;
}

/** Returns false when there was no row to delete. */
export async function removeDailyEntry(
  db: D1Database,
  guildId: string,
  date: string,
  userId: string,
): Promise<boolean> {
  const res = await db
    .prepare("DELETE FROM daily_entries WHERE guild_id = ? AND date = ? AND user_id = ?")
    .bind(guildId, date, userId)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

/* ---------- standing auto-entry ---------- */

export async function isAuto(
  db: D1Database,
  guildId: string,
  userId: string,
): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS x FROM auto_entries WHERE guild_id = ? AND user_id = ?")
    .bind(guildId, userId)
    .first<{ x: number }>();
  return row !== null;
}

export async function addAuto(db: D1Database, guildId: string, userId: string): Promise<void> {
  await db
    .prepare(
      "INSERT OR IGNORE INTO auto_entries (guild_id, user_id, created_at) VALUES (?, ?, ?)",
    )
    .bind(guildId, userId, nowISO())
    .run();
}

export async function removeAuto(db: D1Database, guildId: string, userId: string): Promise<void> {
  await db
    .prepare("DELETE FROM auto_entries WHERE guild_id = ? AND user_id = ?")
    .bind(guildId, userId)
    .run();
}

/* ---------- per-day opt-out (only meaningful for auto-entrants) ---------- */

export async function isExcluded(
  db: D1Database,
  guildId: string,
  date: string,
  userId: string,
): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS x FROM daily_exclusions WHERE guild_id = ? AND date = ? AND user_id = ?")
    .bind(guildId, date, userId)
    .first<{ x: number }>();
  return row !== null;
}

export async function addExclusion(
  db: D1Database,
  guildId: string,
  date: string,
  userId: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO daily_exclusions (guild_id, date, user_id, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(guildId, date, userId, nowISO())
    .run();
}

export async function removeExclusion(
  db: D1Database,
  guildId: string,
  date: string,
  userId: string,
): Promise<void> {
  await db
    .prepare("DELETE FROM daily_exclusions WHERE guild_id = ? AND date = ? AND user_id = ?")
    .bind(guildId, date, userId)
    .run();
}

/* ---------- resolved participants ---------- */

export interface Participant {
  userId: string;
  auto: boolean;
}

/**
 * The people actually in the draw for `date`: everyone with a per-day entry plus
 * every standing auto-entrant, minus anyone who opted out of that specific day.
 */
export async function resolveParticipants(
  db: D1Database,
  guildId: string,
  date: string,
): Promise<Participant[]> {
  const res = await db
    .prepare(
      `SELECT u.user_id AS user_id,
              MAX(CASE WHEN u.src = 'auto' THEN 1 ELSE 0 END) AS auto
       FROM (
         SELECT user_id, 'daily' AS src FROM daily_entries WHERE guild_id = ?1 AND date = ?2
         UNION ALL
         SELECT user_id, 'auto'  AS src FROM auto_entries  WHERE guild_id = ?1
       ) AS u
       WHERE u.user_id NOT IN (
         SELECT user_id FROM daily_exclusions WHERE guild_id = ?1 AND date = ?2
       )
       GROUP BY u.user_id
       ORDER BY u.user_id`,
    )
    .bind(guildId, date)
    .all<{ user_id: string; auto: number }>();
  return (res.results ?? []).map((r) => ({ userId: r.user_id, auto: r.auto === 1 }));
}

/** True when the user is in the draw for `date` (per-day entry, or auto and not opted out). */
export async function isParticipating(
  db: D1Database,
  guildId: string,
  date: string,
  userId: string,
): Promise<boolean> {
  if (await isExcluded(db, guildId, date, userId)) return false;
  if (await hasDailyEntry(db, guildId, date, userId)) return true;
  return isAuto(db, guildId, userId);
}

/* ---------- results ---------- */

export async function getResult(
  db: D1Database,
  guildId: string,
  date: string,
): Promise<DailyResult | null> {
  return db
    .prepare("SELECT * FROM daily_results WHERE guild_id = ? AND date = ?")
    .bind(guildId, date)
    .first<DailyResult>();
}

/** Returns false when a result already existed for the day (double-draw guard). */
export async function insertResult(db: D1Database, r: ResultRecord): Promise<boolean> {
  const res = await db
    .prepare(
      `INSERT OR IGNORE INTO daily_results (guild_id, date, winner_id, drawn_at, type)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(r.guild_id, r.date, r.winner_id, nowISO(), r.type)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

/** Re-draw: keeps the row, refreshes winner/type but not message_id. */
export async function updateResult(db: D1Database, r: ResultRecord): Promise<void> {
  await db
    .prepare(
      `UPDATE daily_results SET winner_id = ?, drawn_at = ?, type = ?
       WHERE guild_id = ? AND date = ?`,
    )
    .bind(r.winner_id, nowISO(), r.type, r.guild_id, r.date)
    .run();
}

export async function setResultMessageId(
  db: D1Database,
  guildId: string,
  date: string,
  messageId: string | null,
): Promise<void> {
  await db
    .prepare("UPDATE daily_results SET message_id = ? WHERE guild_id = ? AND date = ?")
    .bind(messageId, guildId, date)
    .run();
}
