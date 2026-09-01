export const InteractionType = {
  PING: 1,
  APPLICATION_COMMAND: 2,
} as const;

export const InteractionResponseType = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
} as const;

export const MessageFlags = {
  EPHEMERAL: 1 << 6,
} as const;

/** Permissions bitfield: MANAGE_GUILD */
export const MANAGE_GUILD = 1n << 5n;

export interface CommandOption {
  name: string;
  type: number;
  value?: string | number | boolean;
}

export interface Interaction {
  id: string;
  type: number;
  token: string;
  guild_id?: string;
  channel_id?: string;
  member?: {
    user: { id: string; username: string };
    permissions?: string;
  };
  user?: { id: string; username: string };
  data?: {
    name: string;
    options?: CommandOption[];
  };
}

export function actorId(i: Interaction): string {
  return i.member?.user.id ?? i.user?.id ?? "unknown";
}

export function optionValue(i: Interaction, name: string): string | undefined {
  const opt = i.data?.options?.find((o) => o.name === name);
  return opt?.value === undefined ? undefined : String(opt.value);
}

export function hasManageGuild(i: Interaction): boolean {
  const perms = i.member?.permissions;
  if (!perms) return false;
  return (BigInt(perms) & MANAGE_GUILD) === MANAGE_GUILD;
}
