type Level = "INFO" | "WARN" | "ERROR";

function emit(level: Level, event: string, fields: Record<string, unknown>): void {
  const parts = Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${v}`);
  const line = `[${level}] ${event}${parts.length ? " " + parts.join(" ") : ""}`;
  if (level === "ERROR") console.error(line);
  else if (level === "WARN") console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (event: string, fields: Record<string, unknown> = {}) => emit("INFO", event, fields),
  warn: (event: string, fields: Record<string, unknown> = {}) => emit("WARN", event, fields),
  error: (event: string, fields: Record<string, unknown> = {}) => emit("ERROR", event, fields),
};
