export interface ServerConfig {
  readonly port: number;
  readonly host: string;
  readonly logDir: string;
  readonly allowedOrigins: readonly string[];
  readonly maxRooms: number;
  readonly maxPlayersPerRoom: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const port = Number(env["PORT"] ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${env["PORT"]}`);
  }
  const host = env["HOST"] ?? "0.0.0.0";
  const logDir = env["LOG_DIR"] ?? "./logs";
  const originsRaw = env["ALLOWED_ORIGINS"] ?? "http://localhost:5173,http://localhost:3000";
  const allowedOrigins = originsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    port,
    host,
    logDir,
    allowedOrigins,
    maxRooms: Math.max(1, Number(env["MAX_ROOMS"] ?? 20)),
    maxPlayersPerRoom: Math.max(1, Number(env["MAX_PLAYERS_PER_ROOM"] ?? 4)),
  };
}
