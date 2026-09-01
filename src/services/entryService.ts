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

const NOT_SETUP =
  "このサーバーはまだセットアップされていません。管理者に /setup の実行を依頼してください。";
const CLOSED_ENTRY = "本日の抽選は既に終了しているため、参加を受け付けられません。";
const CLOSED_CANCEL = "本日の抽選は既に終了しているため、取り消しできません。";

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

  if (!cfg) return { ok: false, message: NOT_SETUP };
  if (drawn) return { ok: false, message: CLOSED_ENTRY };

  if (!excluded && (hasEntry || auto)) {
    return {
      ok: false,
      message: auto
        ? "既に本日の抽選に参加しています（自動参加が有効です）。"
        : "既に本日の抽選に参加しています。",
    };
  }

  await removeExclusion(env.DB, env.GUILD_ID, date, userId);
  await addDailyEntry(env.DB, env.GUILD_ID, date, userId);
  logger.info("User entered", { guild: env.GUILD_ID, user: userId, date });
  return { ok: true, message: "本日の抽選に参加しました。" };
}

export async function cancel(env: Env, userId: string): Promise<Outcome> {
  const date = dateJST();
  const [cfg, drawn, auto] = await Promise.all([
    getConfig(env.DB, env.GUILD_ID),
    getResult(env.DB, env.GUILD_ID, date),
    isAuto(env.DB, env.GUILD_ID, userId),
  ]);

  if (!cfg) return { ok: false, message: NOT_SETUP };
  if (drawn) return { ok: false, message: CLOSED_CANCEL };

  const removed = await removeDailyEntry(env.DB, env.GUILD_ID, date, userId);
  let optedOut = false;
  if (auto && !(await isExcluded(env.DB, env.GUILD_ID, date, userId))) {
    await addExclusion(env.DB, env.GUILD_ID, date, userId);
    optedOut = true;
  }

  if (!removed && !optedOut) {
    return { ok: false, message: "本日の抽選には参加していません。" };
  }

  logger.info("User cancelled", { guild: env.GUILD_ID, user: userId, date });
  return {
    ok: true,
    message: auto
      ? "本日の抽選への参加を取り消しました。自動参加は有効なままです（停止するには /auto）。"
      : "本日の抽選への参加を取り消しました。",
  };
}

export async function toggleAuto(env: Env, userId: string): Promise<Outcome> {
  const date = dateJST();
  const [cfg, drawn, currentlyAuto] = await Promise.all([
    getConfig(env.DB, env.GUILD_ID),
    getResult(env.DB, env.GUILD_ID, date),
    isAuto(env.DB, env.GUILD_ID, userId),
  ]);

  if (!cfg) return { ok: false, message: NOT_SETUP };
  const drawnToday = drawn !== null;

  if (currentlyAuto) {
    await removeAuto(env.DB, env.GUILD_ID, userId);
    logger.info("Auto-entry off", { guild: env.GUILD_ID, user: userId });
    const keepsToday = await hasDailyEntry(env.DB, env.GUILD_ID, date, userId);
    const alsoToday = !drawnToday && !keepsToday ? "本日分の参加も取り消されました。" : "";
    return { ok: true, message: `自動参加をオフにしました。${alsoToday}`.trimEnd() };
  }

  await addAuto(env.DB, env.GUILD_ID, userId);
  await removeExclusion(env.DB, env.GUILD_ID, date, userId);
  logger.info("Auto-entry on", { guild: env.GUILD_ID, user: userId });
  const note = drawnToday ? "本日は抽選終了済みのため、明日から有効です。" : "";
  return {
    ok: true,
    message: `自動参加をオンにしました。解除するまで毎日自動で抽選に参加します。${note}`.trimEnd(),
  };
}

export async function status(env: Env, userId: string): Promise<string> {
  const date = dateJST();
  const [cfg, auto, excludedToday, hasEntry] = await Promise.all([
    getConfig(env.DB, env.GUILD_ID),
    isAuto(env.DB, env.GUILD_ID, userId),
    isExcluded(env.DB, env.GUILD_ID, date, userId),
    hasDailyEntry(env.DB, env.GUILD_ID, date, userId),
  ]);
  if (!cfg) return NOT_SETUP;

  const joined = !excludedToday && (hasEntry || auto);

  let joinLine: string;
  if (joined) joinLine = "参加中";
  else if (auto && excludedToday) joinLine = "未参加（本日は取り消し済み）";
  else joinLine = "未参加";

  return (
    `本日の抽選（${date}）\n\n` +
    `参加状態: ${joinLine}\n` +
    `自動参加: ${auto ? "オン" : "オフ"}`
  );
}
