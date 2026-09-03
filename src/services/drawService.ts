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
import { fill, messages } from "../messages";
import { dateJST, previousDateJST } from "../util/jst";
import { logger } from "../util/logger";
import { randomPick } from "../util/random";

export type DrawMode = "auto" | "manual" | "reroll";

export type DrawResult =
  | { status: "not_setup" }
  | { status: "already_drawn"; winnerId: string }
  | { status: "nothing_to_reroll" }
  | { status: "reroll_no_candidates"; winnerId: string }
  | { status: "no_entries" }
  | { status: "drawn"; winnerId: string };

type Selection = { kind: "winner"; winnerId: string } | { kind: "empty" };

/**
 * Pure selection: drop any reroll excludes, then pick uniformly. An empty pool
 * means nobody volunteered for the day.
 */
export function selectWinner(args: {
  entries: readonly string[];
  excludeIds?: readonly string[];
}): Selection {
  const blocked = new Set<string>(args.excludeIds ?? []);
  const pool = args.entries.filter((id) => !blocked.has(id));
  if (pool.length === 0) return { kind: "empty" };
  return { kind: "winner", winnerId: randomPick(pool) };
}

const RESULT_TYPE: Record<DrawMode, DailyResult["type"]> = {
  auto: "normal",
  manual: "manual",
  reroll: "reroll",
};

function notification(cfg: GuildConfig, winnerId: string, rerolled = false): string {
  const template = rerolled ? messages.announce.winnerReroll : messages.announce.winner;
  return fill(template, {
    winner: `<@${winnerId}>`,
    workChannel: `<#${cfg.work_channel_id ?? cfg.channel_id}>`,
  });
}

function rerollFollowup(winnerId: string): string {
  return fill(messages.announce.rerollFollowup, { winner: `<@${winnerId}>` });
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
    await editMessage(env, cfg.channel_id, existingMessageId, notification(cfg, winnerId, true), [winnerId]);
    await postMessage(env, cfg.channel_id, rerollFollowup(winnerId), [winnerId]);
    return;
  }
  const messageId = await postMessage(
    env,
    cfg.channel_id,
    notification(cfg, winnerId, mode === "reroll"),
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
  // Grant before revoke: a failed grant must never leave the role unassigned,
  // so the old holder keeps it until the new one demonstrably has it.
  const granted = newHolder ? await addRole(env, cfg.guild_id, newHolder, cfg.role_id) : true;
  if (oldHolder && oldHolder !== newHolder && granted) {
    await removeRole(env, cfg.guild_id, oldHolder, cfg.role_id);
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
  // A no-volunteer day records a winner-less row so the scheduler treats the day
  // as handled; a later /entry + /draw may still fill it, so it is not "drawn".
  const pendingNoEntries = existing !== null && existing.winner_id === null;

  if (mode === "reroll" && (existing === null || existing.winner_id === null)) {
    return { status: "nothing_to_reroll" };
  }
  if (mode !== "reroll" && existing !== null && existing.winner_id !== null) {
    return { status: "already_drawn", winnerId: existing.winner_id };
  }

  logger.info("Draw started", { guild: env.GUILD_ID, date, mode });

  const entries = (await resolveParticipants(env.DB, env.GUILD_ID, date)).map((p) => p.userId);
  // Whoever currently wears the role: yesterday's winner. No-volunteer days strip
  // it, so a single day of lookback is enough to find the holder.
  const roleHolderId =
    (await getResult(env.DB, env.GUILD_ID, previousDateJST()))?.winner_id ?? null;
  const excludeIds = mode === "reroll" && existing?.winner_id ? [existing.winner_id] : [];

  const selection = selectWinner({ entries, excludeIds });
  const oldHolder = mode === "reroll" ? existing?.winner_id ?? null : roleHolderId;

  if (selection.kind === "empty") {
    // A reroll with no *other* eligible entrant leaves the current winner alone.
    if (mode === "reroll" && existing?.winner_id && entries.includes(existing.winner_id)) {
      logger.info("Reroll had no alternative candidate", { guild: env.GUILD_ID, date });
      return { status: "reroll_no_candidates", winnerId: existing.winner_id };
    }

    logger.warn("No participants", { guild: env.GUILD_ID, date, mode });
    await reconcileRoles(env, cfg, oldHolder, null);

    const record = { guild_id: env.GUILD_ID, date, winner_id: null, type: "none" as const };
    if (existing !== null) {
      await updateResult(env.DB, record);
      if (mode === "reroll" && existing.message_id) {
        await editMessage(
          env,
          cfg.channel_id,
          existing.message_id,
          messages.announce.rerollCancelledNoEntries,
          [],
        );
      }
    } else {
      await insertResult(env.DB, record);
    }
    return { status: "no_entries" };
  }

  const winnerId = selection.winnerId;
  const record = {
    guild_id: env.GUILD_ID,
    date,
    winner_id: winnerId,
    type: RESULT_TYPE[mode],
  };

  if (mode === "reroll" || pendingNoEntries) {
    await updateResult(env.DB, record);
  } else {
    const inserted = await insertResult(env.DB, record);
    if (!inserted) {
      const now = await getResult(env.DB, env.GUILD_ID, date);
      return { status: "already_drawn", winnerId: now?.winner_id ?? winnerId };
    }
  }

  logger.info("Winner selected", { guild: env.GUILD_ID, user: winnerId, date, mode });
  await reconcileRoles(env, cfg, oldHolder, winnerId);
  await announceWinner(env, cfg, date, winnerId, mode, existing?.message_id ?? null);
  logger.info("Draw completed", { guild: env.GUILD_ID, date, mode });

  return { status: "drawn", winnerId };
}
