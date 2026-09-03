import { beforeEach, expect, mock, test } from "bun:test";
import { makeD1 } from "./helpers/d1";
import {
  addAuto,
  addDailyEntry,
  getResult,
  insertResult,
  removeDailyEntry,
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
    work_channel_id: "w",
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

  const content = String(posts[0]!.args[2]);
  expect(content).toContain("本日のアンケート担当者は");
  expect(content).toContain("<#w>"); // work channel, not the announce channel
  expect(content).not.toMatch(/\p{Extended_Pictographic}/u); // no emoji

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

test("reroll keeps the current winner when no other entrant is eligible", async () => {
  const env = makeEnv();
  await setup(env);
  await addDailyEntry(env.DB, "g", isoDate(), "X"); // the only entrant

  const first = await runDraw(env, "auto");
  expect((first as { winnerId: string }).winnerId).toBe("X");
  calls = [];

  const res = await runDraw(env, "reroll");
  expect(res).toEqual({ status: "reroll_no_candidates", winnerId: "X" });
  expect(calls.some((c) => c.fn === "editMessage")).toBe(false);
  expect(calls.some((c) => c.fn === "postMessage")).toBe(false);
  expect(calls.some((c) => c.fn === "removeRole")).toBe(false);

  const stored = await getResult(env.DB, "g", isoDate());
  expect(stored?.winner_id).toBe("X");
  expect(stored?.type).toBe("normal"); // untouched
});

test("reroll that loses every entrant clears the day and strips the role", async () => {
  const env = makeEnv();
  await setup(env);
  await addDailyEntry(env.DB, "g", isoDate(), "A");
  await runDraw(env, "auto"); // A wins, announced as msg-1
  await removeDailyEntry(env.DB, "g", isoDate(), "A"); // A drops out before the reroll
  calls = [];

  const res = await runDraw(env, "reroll");
  expect(res).toEqual({ status: "no_entries" });

  const edit = calls.find((c) => c.fn === "editMessage");
  expect(edit?.args[2]).toBe("msg-1");
  expect(String(edit?.args[3])).toContain("担当者はなし");
  expect(calls.some((c) => c.fn === "postMessage")).toBe(false);
  expect(calls.find((c) => c.fn === "removeRole")?.args[2]).toBe("A");
  expect(calls.some((c) => c.fn === "addRole")).toBe(false);

  const stored = await getResult(env.DB, "g", isoDate());
  expect(stored?.type).toBe("none");
  expect(stored?.winner_id).toBeNull();
});

test("yesterday's winner may be drawn again on consecutive days", async () => {
  const env = makeEnv();
  await setup(env);
  await insertResult(env.DB, { guild_id: "g", date: yesterday(), winner_id: "Y", type: "normal" });
  await addAuto(env.DB, "g", "Y"); // Y is the only entrant today

  const res = await runDraw(env, "auto");
  expect(res).toEqual({ status: "drawn", winnerId: "Y" });
});

test("no participants: role is stripped, no announcement, day stays re-drawable", async () => {
  const env = makeEnv();
  await setup(env);
  await insertResult(env.DB, { guild_id: "g", date: yesterday(), winner_id: "Y", type: "normal" });
  // nobody enters today

  const res = await runDraw(env, "auto");
  expect(res).toEqual({ status: "no_entries" });
  expect(calls.find((c) => c.fn === "removeRole")?.args[2]).toBe("Y");
  expect(calls.some((c) => c.fn === "postMessage")).toBe(false);

  const stored = await getResult(env.DB, "g", isoDate());
  expect(stored?.winner_id).toBeNull();
  expect(stored?.type).toBe("none");

  // later, someone volunteers and an admin runs /draw
  await addDailyEntry(env.DB, "g", isoDate(), "Z");
  calls = [];
  const res2 = await runDraw(env, "manual");
  expect(res2).toEqual({ status: "drawn", winnerId: "Z" });
  expect(calls.find((c) => c.fn === "addRole")?.args[2]).toBe("Z");
  expect(calls.some((c) => c.fn === "postMessage")).toBe(true);

  const stored2 = await getResult(env.DB, "g", isoDate());
  expect(stored2?.winner_id).toBe("Z");
  expect(stored2?.type).toBe("manual");
});

function isoDate(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());
}
function yesterday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(
    new Date(Date.now() - 86400000),
  );
}
