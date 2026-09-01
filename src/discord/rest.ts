import { DISCORD_API, type Env } from "../config";
import { logger } from "../util/logger";

async function call(
  env: Env,
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  const res = await fetch(`${DISCORD_API}${path}`, {
    method,
    headers: {
      authorization: `Bot ${env.DISCORD_TOKEN}`,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    logger.error("Discord API error", { method, path, status: res.status, body: text });
  }
  return res;
}

export async function addRole(
  env: Env,
  guildId: string,
  userId: string,
  roleId: string,
): Promise<boolean> {
  const res = await call(
    env,
    "PUT",
    `/guilds/${guildId}/members/${userId}/roles/${roleId}`,
  );
  if (res.ok) logger.info("Role assigned", { guild: guildId, user: userId, role: roleId });
  return res.ok;
}

export async function removeRole(
  env: Env,
  guildId: string,
  userId: string,
  roleId: string,
): Promise<boolean> {
  const res = await call(
    env,
    "DELETE",
    `/guilds/${guildId}/members/${userId}/roles/${roleId}`,
  );
  if (res.ok) logger.info("Role removed", { guild: guildId, user: userId, role: roleId });
  return res.ok;
}

export async function postMessage(
  env: Env,
  channelId: string,
  content: string,
  allowedUserMentions: string[] = [],
): Promise<boolean> {
  const res = await call(env, "POST", `/channels/${channelId}/messages`, {
    content,
    allowed_mentions: { parse: [], users: allowedUserMentions },
  });
  return res.ok;
}

/** Replace the deferred reply of an interaction with final content. */
export async function editOriginal(
  env: Env,
  interactionToken: string,
  content: string,
): Promise<void> {
  await call(
    env,
    "PATCH",
    `/webhooks/${env.DISCORD_APP_ID}/${interactionToken}/messages/@original`,
    { content },
  );
}
