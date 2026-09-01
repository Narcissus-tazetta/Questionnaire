import type { Env } from "../config";
import { getConfig, resolveParticipants, upsertConfig } from "../db/queries";
import { editOriginal } from "../discord/rest";
import { deferEphemeral, ephemeral } from "../discord/responses";
import { actorId, hasManageGuild, optionValue, type Interaction } from "../discord/types";
import { armScheduler } from "../scheduler/drawScheduler";
import { runDraw, type DrawResult } from "../services/drawService";
import { cancel, entry, status, toggleAuto } from "../services/entryService";
import { dateJST, isValidDrawTime } from "../util/jst";
import { logger } from "../util/logger";

const ADMIN_ONLY = "このコマンドはサーバー管理権限を持つメンバー専用です。";

export async function handleCommand(
  interaction: Interaction,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const name = interaction.data?.name;
  const uid = actorId(interaction);

  switch (name) {
    case "entry":
      return ephemeral((await entry(env, uid)).message);

    case "cancel":
      return ephemeral((await cancel(env, uid)).message);

    case "auto":
      return ephemeral((await toggleAuto(env, uid)).message);

    case "status":
      return ephemeral(await status(env, uid));

    case "setup":
      return handleSetup(interaction, env, ctx);

    case "participants":
      return handleParticipants(interaction, env);

    case "draw":
    case "reroll": {
      if (!hasManageGuild(interaction)) return ephemeral(ADMIN_ONLY);
      const mode = name === "draw" ? "manual" : "reroll";
      ctx.waitUntil(
        runDraw(env, mode)
          .then((r) => editOriginal(env, interaction.token, describeDraw(r, mode)))
          .catch((err) => {
            logger.error("Manual draw failed", { mode, error: String(err) });
            return editOriginal(
              env,
              interaction.token,
              "抽選処理でエラーが発生しました。ログを確認してください。",
            );
          }),
      );
      return deferEphemeral();
    }

    default:
      return ephemeral("未対応のコマンドです。");
  }
}

async function handleSetup(
  interaction: Interaction,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  if (!hasManageGuild(interaction)) return ephemeral(ADMIN_ONLY);

  const drawTime = optionValue(interaction, "draw_time");
  const roleId = optionValue(interaction, "role");
  const channelId = optionValue(interaction, "channel");
  const workChannelId = optionValue(interaction, "work_channel");

  if (!drawTime || !roleId || !channelId || !workChannelId) {
    return ephemeral("draw_time / role / channel / work_channel をすべて指定してください。");
  }
  if (!isValidDrawTime(drawTime)) {
    return ephemeral("draw_time は HH:MM（24時間表記・日本時間）で指定してください。例: 20:00");
  }

  await upsertConfig(env.DB, {
    guild_id: env.GUILD_ID,
    draw_time: drawTime,
    role_id: roleId,
    channel_id: channelId,
    work_channel_id: workChannelId,
  });
  logger.info("Guild configured", { guild: env.GUILD_ID, drawTime, roleId, channelId, workChannelId });
  ctx.waitUntil(
    armScheduler(env).catch((e) => logger.error("armScheduler failed", { error: String(e) })),
  );

  return ephemeral(
    "セットアップを保存しました。\n" +
      `抽選時刻: ${drawTime}（日本時間）\n` +
      `担当ロール: <@&${roleId}>\n` +
      `告知チャンネル: <#${channelId}>\n` +
      `制作チャンネル: <#${workChannelId}>`,
  );
}

async function handleParticipants(interaction: Interaction, env: Env): Promise<Response> {
  if (!hasManageGuild(interaction)) return ephemeral(ADMIN_ONLY);

  const cfg = await getConfig(env.DB, env.GUILD_ID);
  if (!cfg) return ephemeral("まだ /setup が実行されていません。");

  const date = dateJST();
  const people = await resolveParticipants(env.DB, env.GUILD_ID, date);
  if (people.length === 0) {
    return ephemeral(`${date} の参加者はまだいません。`);
  }
  const list = people
    .map((p, i) => `${i + 1}. <@${p.userId}>${p.auto ? "（自動）" : ""}`)
    .join("\n");
  return ephemeral(`${date} の参加者（${people.length}名）\n\n${list}`);
}

function describeDraw(r: DrawResult, mode: "manual" | "reroll"): string {
  switch (r.status) {
    case "not_setup":
      return "まだ /setup が実行されていません。";
    case "already_drawn":
      return r.winnerId
        ? `本日は既に抽選済みです（担当者: <@${r.winnerId}>）。やり直すなら /reroll を使用してください。`
        : "本日は既に処理済みです（参加者不在のため担当継続）。";
    case "nothing_to_reroll":
      return "本日はまだ抽選が行われていません。/draw を使用してください。";
    case "carryover":
      return r.winnerId
        ? `参加者がいなかったため抽選は行われませんでした。<@${r.winnerId}> さんが引き続き担当です。`
        : "参加者がいなかったため抽選は行われませんでした。前日の担当者もいないため、担当者は未定です。";
    case "drawn":
      return mode === "reroll"
        ? `再抽選しました。新しい担当者は <@${r.winnerId}> さんです。`
        : `抽選しました。担当者は <@${r.winnerId}> さんです。`;
  }
}
