import type { Env } from "../config";
import {
  addAuto,
  addDailyEntry,
  addExclusion,
  getConfig,
  getResult,
  hasDailyEntry,
  isAuto,
  isExcluded,
  removeAuto,
  removeDailyEntry,
  removeExclusion,
} from "../db/queries";
import { dateJST } from "../util/jst";
import { logger } from "../util/logger";
import { fill, messages } from "../messages";

export interface Outcome {
  ok: boolean;
  message: string;
}

export async function entry(env: Env, userId: string): Promise<Outcome> {
  const date = dateJST();
  const [cfg, drawn, auto, excluded, hasEntry] = await Promise.all([
    getConfig(env.DB, env.GUILD_ID),
    getResult(env.DB, env.GUILD_ID, date),
    isAuto(env.DB, env.GUILD_ID, userId),
    isExcluded(env.DB, env.GUILD_ID, date, userId),
    hasDailyEntry(env.DB, env.GUILD_ID, date, userId),
  ]);

  if (!cfg) return { ok: false, message: messages.common.notSetup };
  if (drawn) return { ok: false, message: messages.entry.closed };

  if (!excluded && (hasEntry || auto)) {
    return {
      ok: false,
      message: auto ? messages.entry.alreadyAuto : messages.entry.already,
    };
  }

  await removeExclusion(env.DB, env.GUILD_ID, date, userId);
  await addDailyEntry(env.DB, env.GUILD_ID, date, userId);
  logger.info("User entered", { guild: env.GUILD_ID, user: userId, date });
  return { ok: true, message: messages.entry.ok };
}

export async function cancel(env: Env, userId: string): Promise<Outcome> {
  const date = dateJST();
  const [cfg, drawn, auto] = await Promise.all([
    getConfig(env.DB, env.GUILD_ID),
    getResult(env.DB, env.GUILD_ID, date),
    isAuto(env.DB, env.GUILD_ID, userId),
  ]);

  if (!cfg) return { ok: false, message: messages.common.notSetup };
  if (drawn) return { ok: false, message: messages.cancel.closed };

  const removed = await removeDailyEntry(env.DB, env.GUILD_ID, date, userId);
  let optedOut = false;
  if (auto && !(await isExcluded(env.DB, env.GUILD_ID, date, userId))) {
    await addExclusion(env.DB, env.GUILD_ID, date, userId);
    optedOut = true;
  }

  if (!removed && !optedOut) {
    return { ok: false, message: messages.cancel.notJoined };
  }

  logger.info("User cancelled", { guild: env.GUILD_ID, user: userId, date });
  return {
    ok: true,
    message: auto ? messages.cancel.okAuto : messages.cancel.ok,
  };
}

export async function toggleAuto(env: Env, userId: string): Promise<Outcome> {
  const date = dateJST();
  const [cfg, drawn, currentlyAuto] = await Promise.all([
    getConfig(env.DB, env.GUILD_ID),
    getResult(env.DB, env.GUILD_ID, date),
    isAuto(env.DB, env.GUILD_ID, userId),
  ]);

  if (!cfg) return { ok: false, message: messages.common.notSetup };
  const drawnToday = drawn !== null;

  if (currentlyAuto) {
    await removeAuto(env.DB, env.GUILD_ID, userId);
    logger.info("Auto-entry off", { guild: env.GUILD_ID, user: userId });
    const keepsToday = await hasDailyEntry(env.DB, env.GUILD_ID, date, userId);
    const note = !drawnToday && !keepsToday ? messages.auto.offAlsoTodayNote : "";
    return { ok: true, message: fill(messages.auto.off, { note }) };
  }

  await addAuto(env.DB, env.GUILD_ID, userId);
  await removeExclusion(env.DB, env.GUILD_ID, date, userId);
  logger.info("Auto-entry on", { guild: env.GUILD_ID, user: userId });
  const note = drawnToday ? messages.auto.onDrawnNote : "";
  return { ok: true, message: fill(messages.auto.on, { note }) };
}

export async function status(env: Env, userId: string): Promise<string> {
  const date = dateJST();
  const [cfg, auto, excludedToday, hasEntry] = await Promise.all([
    getConfig(env.DB, env.GUILD_ID),
    isAuto(env.DB, env.GUILD_ID, userId),
    isExcluded(env.DB, env.GUILD_ID, date, userId),
    hasDailyEntry(env.DB, env.GUILD_ID, date, userId),
  ]);
  if (!cfg) return messages.common.notSetup;

  const joined = !excludedToday && (hasEntry || auto);

  let joinState: string;
  if (joined) joinState = messages.status.joined;
  else if (auto && excludedToday) joinState = messages.status.notJoinedCancelled;
  else joinState = messages.status.notJoined;

  return fill(messages.status.body, {
    date,
    joinState,
    autoState: auto ? messages.status.autoOn : messages.status.autoOff,
  });
}
