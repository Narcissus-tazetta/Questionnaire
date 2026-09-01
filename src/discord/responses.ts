import { InteractionResponseType, MessageFlags } from "./types";

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });
}

export const pong = () => json({ type: InteractionResponseType.PONG });

/** Immediate ephemeral reply (only the invoking user sees it). */
export function ephemeral(content: string): Response {
  return json({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content, flags: MessageFlags.EPHEMERAL },
  });
}

/** Acknowledge now, edit the message later via editOriginal(). */
export function deferEphemeral(): Response {
  return json({
    type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    data: { flags: MessageFlags.EPHEMERAL },
  });
}
