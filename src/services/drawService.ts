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
  | { status: "already_drawn"; winnerId: string | null; type: DailyResult["type"] }
  | { status: "nothing_to_reroll" }
  | { status: "reroll_no_candidates"; winnerId: string }
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

function carryoverEdit(prevWinnerId: string | null): string {
  return prevWinnerId
    ? fill(messages.announce.carryoverEditWithWinner, { prevWinner: `<@${prevWinnerId}>` })
    : messages.announce.carryoverEditNoWinner;
}

function carryoverFollowup(prevWinnerId: string): string {
  return fill(messages.announce.carryoverFollowup, { prevWinner: `<@${prevWinnerId}>` });
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
    // A reroll with no *other* eligible entrant leaves the current winner in
    // place rather than demoting them to yesterday's holder.
    if (mode === "reroll" && existing?.winner_id && entries.includes(existing.winner_id)) {
      logger.info("Reroll had no alternative candidate", { guild: env.GUILD_ID, date });
      return { status: "reroll_no_candidates", winnerId: existing.winner_id };
    }

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
      const mentions = prevWinnerId ? [prevWinnerId] : [];
      if (existing?.message_id) {
        await editMessage(env, cfg.channel_id, existing.message_id, carryoverEdit(prevWinnerId), mentions);
      }
      // Edits don't notify, so ping the carried-over holder with a follow-up.
      if (prevWinnerId) {
        await postMessage(env, cfg.channel_id, carryoverFollowup(prevWinnerId), [prevWinnerId]);
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
