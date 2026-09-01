import type { Env } from "../config";
import { getConfig, getResult, purgeDailyDataBefore } from "../db/queries";
import { runDraw } from "../services/drawService";
import { dateJST, nextDrawEpochMs } from "../util/jst";
import { logger } from "../util/logger";

const SCHEDULER_NAME = "draw-scheduler";

export function schedulerStub(env: Env): DurableObjectStub {
  return env.DRAW_SCHEDULER.get(env.DRAW_SCHEDULER.idFromName(SCHEDULER_NAME));
}

/** Re-point the alarm at the next draw. Call after `/setup` changes the time. */
export async function armScheduler(env: Env): Promise<void> {
  await schedulerStub(env).fetch("https://scheduler/arm");
}

/** Set the alarm only if nothing is scheduled yet (cheap safety net). */
export async function ensureScheduler(env: Env): Promise<void> {
  await schedulerStub(env).fetch("https://scheduler/ensure");
}

/**
 * A timer, not a data store. Holds a single alarm that fires at the configured
 * draw time, runs the draw, then re-arms itself for the next day. Using a
 * Durable Object alarm instead of a Cron Trigger keeps the bot at zero cron
 * triggers and ~1 scheduled invocation per day.
 */
export class DrawScheduler implements DurableObject {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const mode = new URL(request.url).pathname === "/arm" ? "arm" : "ensure";

    const cfg = await getConfig(this.env.DB, this.env.GUILD_ID);
    if (!cfg) {
      await this.state.storage.deleteAlarm();
      return new Response("no-config");
    }

    const existing = await this.state.storage.getAlarm();
    if (mode === "arm" || existing === null) {
      await this.reschedule(cfg.draw_time);
    }
    return new Response("ok");
  }

  async alarm(): Promise<void> {
    const cfg = await getConfig(this.env.DB, this.env.GUILD_ID);
    if (!cfg) return;

    try {
      const result = await runDraw(this.env, "auto");
      logger.info("Scheduled draw finished", {
        guild: this.env.GUILD_ID,
        date: dateJST(),
        status: result.status,
      });
      await purgeDailyDataBefore(this.env.DB, this.env.GUILD_ID, dateJST()).catch((e) =>
        logger.warn("Daily data purge failed", { error: String(e) }),
      );
    } finally {
      await this.reschedule(cfg.draw_time);
    }
  }

  private async reschedule(drawTime: string): Promise<void> {
    const drawn = (await getResult(this.env.DB, this.env.GUILD_ID, dateJST())) !== null;
    await this.state.storage.setAlarm(nextDrawEpochMs(drawTime, drawn));
  }
}
