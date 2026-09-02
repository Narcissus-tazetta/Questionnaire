import type { Env } from "./config";
import { verifyRequest } from "./discord/verify";
import { pong } from "./discord/responses";
import { InteractionType, type Interaction } from "./discord/types";
import { handleCommand } from "./interactions/router";
import { messages } from "./messages";
import { ensureScheduler } from "./scheduler/drawScheduler";
import { logger } from "./util/logger";

export { DrawScheduler } from "./scheduler/drawScheduler";

const EPHEMERAL = 1 << 6;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ status: "ok" });
    }

    if (request.method !== "POST") {
      return new Response("Not Found", { status: 404 });
    }

    const body = await verifyRequest(request, env.DISCORD_PUBLIC_KEY);
    if (body === null) {
      return new Response("invalid request signature", { status: 401 });
    }

    const interaction = body as Interaction;

    if (interaction.type === InteractionType.PING) {
      return pong();
    }

    if (interaction.type === InteractionType.APPLICATION_COMMAND) {
      if (!interaction.guild_id || interaction.guild_id !== env.GUILD_ID) {
        return Response.json({
          type: 4,
          data: { content: messages.guard.wrongGuild, flags: EPHEMERAL },
        });
      }

      // Keep the daily alarm alive even if the arm-on-/setup call was ever missed.
      ctx.waitUntil(ensureScheduler(env).catch((e) => logger.error("ensureScheduler failed", { error: String(e) })));

      try {
        return await handleCommand(interaction, env, ctx);
      } catch (err) {
        logger.error("Command handler failed", {
          command: interaction.data?.name,
          error: String(err),
        });
        return Response.json({
          type: 4,
          data: { content: messages.common.error, flags: EPHEMERAL },
        });
      }
    }

    return new Response("unsupported interaction type", { status: 400 });
  },
};
