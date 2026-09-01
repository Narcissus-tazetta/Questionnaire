import type { Env } from "../config";
import {
  getConfig,
  getResult,
  insertResult,
  resolveParticipants,
  setResultMessageId,
  updateResult,
  type DailyResult,
  type GuildConfig,
} from "../db/queries";
import { addRole, editMessage, postMessage, removeRole } from "../discord/rest";
import { dateJST, previousDateJST } from "../util/jst";
import { logger } from "../util/logger";
import { randomPick } from "../util/random";

export type DrawMode = "auto" | "manual" | "reroll";

export type DrawResult =
  | { status: "not_setup" }
  | { status: "already_drawn"; winnerId: string | null; type: DailyResult["type"] }
  | { status: "nothing_to_reroll" }
  | { status: "carryover"; winnerId: string | null }
  | { status: "drawn"; winnerId: string };

type Selection = { kind: "winner"; winnerId: string } | { kind: "carryover" };

/**
 * Pure selection: exclude the previous day's winner (§10) plus any reroll
 * excludes, then pick uniformly. An empty eligible pool — including the case
 * where the only entrant is yesterday's winner — falls back to carryover (§11).
 */
export function selectWinner(args: {
  entries: readonly string[];
  prevWinnerId: string | null;
  excludeIds?: readonly string[];
}): Selection {
  const blocked = new Set<string>(args.excludeIds ?? []);
  if (args.prevWinnerId) blocked.add(args.prevWinnerId);
  const pool = args.entries.filter((id) => !blocked.has(id));
  if (pool.length === 0) return { kind: "carryover" };
  return { kind: "winner", winnerId: randomPick(pool) };
}

const RESULT_TYPE: Record<DrawMode, DailyResult["type"]> = {
  auto: "normal",
  manual: "manual",
  reroll: "reroll",
};

function notification(winnerId: string, rerolled = false): string {
  const head = rerolled
    ? "🎉 本日のアンケート担当者が決まりました!(再抽選)"
    : "🎉 本日のアンケート担当者が決まりました!";
  return `${head}\n\n<@${winnerId}> さんです!\n\n本日のアンケートをよろしくお願いします!📋`;
}

function rerollFollowup(winnerId: string): string {
  return `🔁 再抽選しました → <@${winnerId}> さん`;
}

function carryoverEdit(prevWinnerId: string | null): string {
  return prevWinnerId
    ? `⚠️ 参加者がいなくなったため再抽選は取り消され、<@${prevWinnerId}> さんが引き続き担当です。`
    : "⚠️ 参加者がいなくなったため再抽選は取り消されました。担当者は未定です。";
}

/**
 * Announce the winner. On reroll, edit the original announcement in place and
 * add a short follow-up so the new winner is pinged; otherwise post fresh and
 * remember the message id for a later reroll.
 */
async function announceWinner(
  env: Env,
  cfg: GuildConfig,
  date: string,
  winnerId: string,
  mode: DrawMode,
  existingMessageId: string | null,
): Promise<void> {
  if (mode === "reroll" && existingMessageId) {
    await editMessage(env, cfg.channel_id, existingMessageId, notification(winnerId, true), [winnerId]);
    await postMessage(env, cfg.channel_id, rerollFollowup(winnerId), [winnerId]);
    return;
  }
  const messageId = await postMessage(
    env,
    cfg.channel_id,
    notification(winnerId, mode === "reroll"),
    [winnerId],
  );
  await setResultMessageId(env.DB, env.GUILD_ID, date, messageId);
}

async function reconcileRoles(
  env: Env,
  cfg: GuildConfig,
  oldHolder: string | null,
  newHolder: string | null,
): Promise<void> {
  if (oldHolder && oldHolder !== newHolder) {
    await removeRole(env, cfg.guild_id, oldHolder, cfg.role_id);
  }
  if (newHolder) {
    await addRole(env, cfg.guild_id, newHolder, cfg.role_id);
  }
}

export async function runDraw(env: Env, mode: DrawMode): Promise<DrawResult> {
  const cfg = await getConfig(env.DB, env.GUILD_ID);
  if (!cfg) {
    if (mode === "auto") logger.warn("Draw skipped: not set up", { guild: env.GUILD_ID });
    return { status: "not_setup" };
  }

  const date = dateJST();
  const existing = await getResult(env.DB, env.GUILD_ID, date);

  if (mode === "reroll" && !existing) return { status: "nothing_to_reroll" };
  if (mode !== "reroll" && existing) {
    return { status: "already_drawn", winnerId: existing.winner_id, type: existing.type };
  }

  logger.info("Draw started", { guild: env.GUILD_ID, date, mode });

  const entries = (await resolveParticipants(env.DB, env.GUILD_ID, date)).map((p) => p.userId);
  const prevWinnerId =
    (await getResult(env.DB, env.GUILD_ID, previousDateJST()))?.winner_id ?? null;
  const excludeIds =
    mode === "reroll" && existing?.winner_id ? [existing.winner_id] : [];

  const selection = selectWinner({ entries, prevWinnerId, excludeIds });

  if (selection.kind === "carryover") {
    logger.warn("No participants", { guild: env.GUILD_ID, date, mode });
    const record = {
      guild_id: env.GUILD_ID,
      date,
      winner_id: prevWinnerId,
      type: "carryover" as const,
    };
    if (mode === "reroll") {
      // Undo the earlier winner's role from today's first draw.
      await reconcileRoles(env, cfg, existing?.winner_id ?? null, prevWinnerId);
      await updateResult(env.DB, record);
      if (existing?.message_id) {
        await editMessage(env, cfg.channel_id, existing.message_id, carryoverEdit(prevWinnerId));
      }
    } else {
      const inserted = await insertResult(env.DB, record);
      if (!inserted) {
        const now = await getResult(env.DB, env.GUILD_ID, date);
        return { status: "already_drawn", winnerId: now?.winner_id ?? null, type: now?.type ?? "carryover" };
      }
    }
    return { status: "carryover", winnerId: prevWinnerId };
  }

  const winnerId = selection.winnerId;
  const oldHolder = mode === "reroll" ? existing?.winner_id ?? null : prevWinnerId;

  const record = {
    guild_id: env.GUILD_ID,
    date,
    winner_id: winnerId,
    type: RESULT_TYPE[mode],
  };

  if (mode === "reroll") {
    await updateResult(env.DB, record);
  } else {
    const inserted = await insertResult(env.DB, record);
    if (!inserted) {
      const now = await getResult(env.DB, env.GUILD_ID, date);
      return { status: "already_drawn", winnerId: now?.winner_id ?? null, type: now?.type ?? "normal" };
    }
  }

  logger.info("Winner selected", { guild: env.GUILD_ID, user: winnerId, date, mode });
  await reconcileRoles(env, cfg, oldHolder, winnerId);
  await announceWinner(env, cfg, date, winnerId, mode, existing?.message_id ?? null);
  logger.info("Draw completed", { guild: env.GUILD_ID, date, mode });

  return { status: "drawn", winnerId };
}
