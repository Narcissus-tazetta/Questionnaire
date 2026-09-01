import { beforeEach, expect, mock, test } from "bun:test";
import { makeD1 } from "./helpers/d1";
import {
  addAuto,
  addDailyEntry,
  getResult,
  insertResult,
  upsertConfig,
} from "../src/db/queries";

type Call = { fn: string; args: unknown[] };
let calls: Call[] = [];
let nextPostId: string | null = "msg-1";

const rec = (fn: string) => (...args: unknown[]) => {
  calls.push({ fn, args });
  return Promise.resolve(fn === "postMessage" ? nextPostId : true);
};

mock.module("../src/discord/rest", () => ({
  addRole: rec("addRole"),
  removeRole: rec("removeRole"),
  postMessage: rec("postMessage"),
  editMessage: rec("editMessage"),
  editOriginal: rec("editOriginal"),
}));

const { runDraw } = await import("../src/services/drawService");

function makeEnv() {
  return {
    DB: makeD1(),
    DRAW_SCHEDULER: undefined,
    DISCORD_TOKEN: "x",
    DISCORD_PUBLIC_KEY: "x",
    DISCORD_APP_ID: "x",
    GUILD_ID: "g",
  } as unknown as import("../src/config").Env;
}

beforeEach(() => {
  calls = [];
  nextPostId = "msg-1";
});

async function setup(env: ReturnType<typeof makeEnv>) {
  await upsertConfig(env.DB, {
    guild_id: "g",
    draw_time: "20:00",
    role_id: "r",
    channel_id: "c",
  });
}

test("first draw posts an announcement and stores its message id", async () => {
  const env = makeEnv();
  await setup(env);
  await addDailyEntry(env.DB, "g", isoDate(), "A");
  await addDailyEntry(env.DB, "g", isoDate(), "B");

  const res = await runDraw(env, "auto");
  expect(res.status).toBe("drawn");

  const posts = calls.filter((c) => c.fn === "postMessage");
  expect(posts).toHaveLength(1);
  expect(calls.some((c) => c.fn === "editMessage")).toBe(false);

  const stored = await getResult(env.DB, "g", isoDate());
  expect(stored?.message_id).toBe("msg-1");
  expect(stored?.type).toBe("normal");
});

test("reroll edits the original announcement and pings via a follow-up", async () => {
  const env = makeEnv();
  await setup(env);
  await addDailyEntry(env.DB, "g", isoDate(), "A");
  await addDailyEntry(env.DB, "g", isoDate(), "B");
  await addDailyEntry(env.DB, "g", isoDate(), "C");

  const first = await runDraw(env, "auto");
  const firstWinner = (first as { winnerId: string }).winnerId;
  calls = [];

  const res = await runDraw(env, "reroll");
  expect(res.status).toBe("drawn");
  const newWinner = (res as { winnerId: string }).winnerId;
  expect(newWinner).not.toBe(firstWinner);

  const edit = calls.find((c) => c.fn === "editMessage");
  expect(edit?.args[2]).toBe("msg-1");
  expect(String(edit?.args[3])).toContain("再抽選");

  const followup = calls.find((c) => c.fn === "postMessage");
  expect(String(followup?.args[2])).toContain(newWinner);

  const stored = await getResult(env.DB, "g", isoDate());
  expect(stored?.type).toBe("reroll");
  expect(stored?.winner_id).toBe(newWinner);
});

test("reroll falls back to a fresh post when the original message id is missing", async () => {
  const env = makeEnv();
  await setup(env);
  nextPostId = null; // first announcement fails to return an id
  await addDailyEntry(env.DB, "g", isoDate(), "A");
  await addDailyEntry(env.DB, "g", isoDate(), "B");
  await runDraw(env, "auto");
  calls = [];
  nextPostId = "msg-2";

  const res = await runDraw(env, "reroll");
  expect(res.status).toBe("drawn");
  expect(calls.some((c) => c.fn === "editMessage")).toBe(false);
  const posts = calls.filter((c) => c.fn === "postMessage");
  expect(posts).toHaveLength(1);
  expect(String(posts[0]!.args[2])).toContain("再抽選");

  const stored = await getResult(env.DB, "g", isoDate());
  expect(stored?.message_id).toBe("msg-2");
});

test("previous-day winner is excluded and does not lose their role on carryover", async () => {
  const env = makeEnv();
  await setup(env);
  // yesterday's winner recorded directly
  await insertResult(env.DB, { guild_id: "g", date: yesterday(), winner_id: "Y", type: "normal" });
  // only entrant today is yesterday's winner -> carryover
  await addAuto(env.DB, "g", "Y");

  const res = await runDraw(env, "auto");
  expect(res).toEqual({ status: "carryover", winnerId: "Y" });
  expect(calls.some((c) => c.fn === "postMessage")).toBe(false);
  expect(calls.some((c) => c.fn === "removeRole")).toBe(false);
});

function isoDate(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());
}
function yesterday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(
    new Date(Date.now() - 86400000),
  );
}
