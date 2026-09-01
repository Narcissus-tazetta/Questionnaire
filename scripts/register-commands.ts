/**
 * Registers the guild slash commands. Run with Bun:
 *   bun run register
 *
 * Reads DISCORD_APP_ID / DISCORD_TOKEN / GUILD_ID from the environment
 * (or from a local .dev.vars file if present).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

// Option types: 3 = STRING, 7 = CHANNEL, 8 = ROLE
const commands = [
  { name: "entry", description: "本日のアンケート担当抽選に参加する" },
  { name: "auto", description: "自動参加のオン/オフを切り替える（解除するまで毎日参加）" },
  { name: "cancel", description: "本日の抽選への参加を取り消す" },
  { name: "status", description: "自分の参加状態と自動参加の設定を確認する" },
  {
    name: "setup",
    description: "Botのサーバー設定を行う（管理者用）",
    default_member_permissions: "32", // MANAGE_GUILD
    options: [
      { name: "draw_time", description: "抽選時刻 HH:MM（日本時間）", type: 3, required: true },
      { name: "role", description: "アンケート担当ロール", type: 8, required: true },
      { name: "channel", description: "抽選結果を告知するチャンネル", type: 7, required: true },
      { name: "work_channel", description: "アンケートを制作するチャンネル", type: 7, required: true },
    ],
  },
  {
    name: "draw",
    description: "本日の抽選を手動実行する（管理者用）",
    default_member_permissions: "32",
  },
  {
    name: "reroll",
    description: "本日の抽選をやり直す（管理者用）",
    default_member_permissions: "32",
  },
  {
    name: "participants",
    description: "本日の参加者一覧を表示する（管理者用）",
    default_member_permissions: "32",
  },
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
