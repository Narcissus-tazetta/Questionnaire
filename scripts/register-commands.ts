/**
 * Registers the guild slash commands. Run with Bun:
 *   bun run register
 *
 * Reads DISCORD_APP_ID / DISCORD_TOKEN / GUILD_ID from the environment
 * (or from a local .dev.vars file if present).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { messages } from "../src/messages";

function loadDevVars(): void {
  try {
    const text = readFileSync(join(process.cwd(), ".dev.vars"), { encoding: "utf8" });
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, "");
    }
  } catch {
    // no .dev.vars — rely on the real environment
  }
}

loadDevVars();

const APP_ID = requireEnv("DISCORD_APP_ID");
const TOKEN = requireEnv("DISCORD_TOKEN");
const GUILD_ID = requireEnv("GUILD_ID");

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`missing env var: ${name}`);
    process.exit(1);
  }
  return v;
}

// Command descriptions live in src/messages.ts (commands:). Only the structure
// — option types, required flags, admin permission — is defined here.
// Option types: 3 = STRING, 7 = CHANNEL, 8 = ROLE
const { commands: text } = messages;
const commands = [
  { name: "entry", description: text.entry },
  { name: "auto", description: text.auto },
  { name: "cancel", description: text.cancel },
  { name: "status", description: text.status },
  {
    name: "setup",
    description: text.setup,
    default_member_permissions: "32", // MANAGE_GUILD
    options: [
      { name: "draw_time", description: text.setupOptions.draw_time, type: 3, required: true },
      { name: "role", description: text.setupOptions.role, type: 8, required: true },
      { name: "channel", description: text.setupOptions.channel, type: 7, required: true },
      { name: "work_channel", description: text.setupOptions.work_channel, type: 7, required: true },
    ],
  },
  { name: "draw", description: text.draw, default_member_permissions: "32" },
  { name: "reroll", description: text.reroll, default_member_permissions: "32" },
  { name: "participants", description: text.participants, default_member_permissions: "32" },
];

const res = await fetch(
  `https://discord.com/api/v10/applications/${APP_ID}/guilds/${GUILD_ID}/commands`,
  {
    method: "PUT",
    headers: {
      authorization: `Bot ${TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(commands),
  },
);

if (!res.ok) {
  console.error(`failed: ${res.status}\n${await res.text()}`);
  process.exit(1);
}

console.log(`registered ${commands.length} commands to guild ${GUILD_ID}`);
