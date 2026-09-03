import type { Env } from "../config";
import { getConfig, resolveParticipants, upsertConfig } from "../db/queries";
import { editOriginal } from "../discord/rest";
import { deferEphemeral, ephemeral } from "../discord/responses";
import { actorId, hasManageGuild, optionValue, type Interaction } from "../discord/types";
import { armScheduler } from "../scheduler/drawScheduler";
import { runDraw, type DrawResult } from "../services/drawService";
import { cancel, entry, status, toggleAuto } from "../services/entryService";
import { isValidDrawTime, nextDateJST } from "../util/jst";
import { logger } from "../util/logger";
import { fill, messages } from "../messages";

/**
 * Acknowledge immediately with a deferred ephemeral reply, then run `work` and
 * patch the result in. Keeps handlers inside Discord's 3-second ACK window
 * regardless of how many round-trips the work needs.
 */
function deferred(
  interaction: Interaction,
  env: Env,
  ctx: ExecutionContext,
  work: () => Promise<string>,
): Response {
  ctx.waitUntil(
    work()
      .then((content) => editOriginal(env, interaction.token, content))
      .catch((err) => {
        logger.error("Command handler failed", {
          command: interaction.data?.name,
          error: String(err),
        });
        return editOriginal(env, interaction.token, messages.common.error);
      }),
  );
  return deferEphemeral();
}

export async function handleCommand(
  interaction: Interaction,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const name = interaction.data?.name;
  const uid = actorId(interaction);

  switch (name) {
    case "entry":
      return deferred(interaction, env, ctx, async () => (await entry(env, uid)).message);

    case "cancel":
      return deferred(interaction, env, ctx, async () => (await cancel(env, uid)).message);

    case "auto":
      return deferred(interaction, env, ctx, async () => (await toggleAuto(env, uid)).message);

    case "status":
      return deferred(interaction, env, ctx, () => status(env, uid));

    case "setup":
      return handleSetup(interaction, env, ctx);

    case "participants":
      if (!hasManageGuild(interaction)) return ephemeral(messages.common.adminOnly);
      return deferred(interaction, env, ctx, () => describeParticipants(env));

    case "draw":
    case "reroll": {
      if (!hasManageGuild(interaction)) return ephemeral(messages.common.adminOnly);
      const mode = name === "draw" ? "manual" : "reroll";
      ctx.waitUntil(
        runDraw(env, mode)
          .then((r) => editOriginal(env, interaction.token, describeDraw(r, mode)))
          .catch((err) => {
            logger.error("Manual draw failed", { mode, error: String(err) });
            return editOriginal(env, interaction.token, messages.draw.error);
          }),
      );
      return deferEphemeral();
    }

    default:
      return ephemeral(messages.common.unknownCommand);
  }
}

async function handleSetup(
  interaction: Interaction,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  if (!hasManageGuild(interaction)) return ephemeral(messages.common.adminOnly);

  const drawTime = optionValue(interaction, "draw_time");
  const roleId = optionValue(interaction, "role");
  const channelId = optionValue(interaction, "channel");
  const workChannelId = optionValue(interaction, "work_channel");

  if (!drawTime || !roleId || !channelId || !workChannelId) {
    return ephemeral(messages.setup.missingOptions);
  }
  if (!isValidDrawTime(drawTime)) {
    return ephemeral(messages.setup.invalidTime);
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
    fill(messages.setup.saved, {
      drawTime,
      role: `<@&${roleId}>`,
      channel: `<#${channelId}>`,
      workChannel: `<#${workChannelId}>`,
    }),
  );
}

async function describeParticipants(env: Env): Promise<string> {
  const cfg = await getConfig(env.DB, env.GUILD_ID);
  if (!cfg) return messages.common.notSetupShort;

  const date = nextDateJST();
  const people = await resolveParticipants(env.DB, env.GUILD_ID, date);
  if (people.length === 0) {
    return fill(messages.participants.empty, { date });
  }
  const list = people
    .map((p, i) => `${i + 1}. <@${p.userId}>${p.auto ? messages.participants.autoSuffix : ""}`)
    .join("\n");
  return fill(messages.participants.list, { date, count: people.length, list });
}

function describeDraw(r: DrawResult, mode: "manual" | "reroll"): string {
  switch (r.status) {
    case "not_setup":
      return messages.common.notSetupShort;
    case "already_drawn":
      return fill(messages.draw.alreadyDrawn, { winner: `<@${r.winnerId}>` });
    case "nothing_to_reroll":
      return messages.draw.nothingToReroll;
    case "reroll_no_candidates":
      return fill(messages.draw.rerollNoCandidates, { winner: `<@${r.winnerId}>` });
    case "no_entries":
      return messages.draw.noEntries;
    case "drawn":
      return mode === "reroll"
        ? fill(messages.draw.rerolledReply, { winner: `<@${r.winnerId}>` })
        : fill(messages.draw.drawnReply, { winner: `<@${r.winnerId}>` });
  }
}
