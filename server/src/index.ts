import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import { parseClientMessage } from "@tank1990/shared";
import { loadConfig } from "./config.js";
import { TokenBucket } from "./rateLimit.js";
import { RoomManager, type Room } from "./rooms.js";

const config = loadConfig();
const roomManager = new RoomManager(config.logDir, config.maxRooms);
const clientDistDir = resolve(import.meta.dirname, "../../client/dist");

let shuttingDown = false;

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

async function serveStatic(reqPath: string, res: ServerResponse): Promise<void> {
  const cleanPath = reqPath === "/" ? "/index.html" : reqPath;
  const normalized = normalize(cleanPath).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = join(clientDistDir, normalized);

  if (!filePath.startsWith(clientDistDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error("Not a file");
    const content = await readFile(filePath);
    const mime = MIME_TYPES[extname(filePath)] ?? "application/octet-stream";
    res.writeHead(200, { "Content-Type": mime });
    res.end(content);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not Found");
  }
}

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, { status: "ok", uptimeSec: Math.round(process.uptime()) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/ready") {
    sendJson(res, shuttingDown ? 503 : 200, { ready: !shuttingDown });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/rooms") {
    sendJson(res, 200, { rooms: roomManager.listRooms() });
    return;
  }

  if (req.method === "GET") {
    await serveStatic(url.pathname, res);
    return;
  }

  res.writeHead(405);
  res.end();
});

const wss = new WebSocketServer({
  server,
  path: "/ws",
  maxPayload: 2048,
  verifyClient: ({ origin }, done) => {
    if (!origin || config.allowedOrigins.includes(origin)) {
      done(true);
    } else {
      done(false, 403, "Origin not allowed");
    }
  },
});

interface SocketMeta {
  room: Room | null;
  alive: boolean;
  limiter: TokenBucket;
}

const socketMeta = new WeakMap<WebSocket, SocketMeta>();

wss.on("connection", (socket: WebSocket) => {
  if (shuttingDown) {
    socket.close(1001, "Server shutting down");
    return;
  }

  const meta: SocketMeta = {
    room: null,
    alive: true,
    limiter: new TokenBucket(120, 60),
  };
  socketMeta.set(socket, meta);

  const joinTimeout = setTimeout(() => {
    if (!meta.room) {
      socket.close(4001, "Join timeout");
    }
  }, 5000);

  socket.on("pong", () => {
    meta.alive = true;
  });

  socket.on("message", (raw) => {
    if (!meta.limiter.consume(1)) {
      socket.close(4008, "Rate limit exceeded");
      return;
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw.toString("utf8"));
    } catch {
      socket.close(4002, "Invalid JSON");
      return;
    }

    const msg = parseClientMessage(parsedJson);
    if (!msg) {
      socket.close(4003, "Invalid message schema");
      return;
    }

    if (msg.type === "join") {
      if (meta.room) return;
      const room = roomManager.getOrCreate(msg.room);
      if (!room || room.players.size >= config.maxPlayersPerRoom) {
        socket.close(4004, "Room full");
        return;
      }
      clearTimeout(joinTimeout);
      meta.room = room;
      room.addPlayer(socket, msg.name);
      return;
    }

    if (!meta.room) {
      socket.close(4005, "Join a room first");
      return;
    }

    if (msg.type === "input") {
      meta.room.handleInput(socket, msg.input);
    } else if (msg.type === "ping") {
      meta.room.sendJson(socket, {
        type: "pong",
        clientTime: msg.clientTime,
        serverTime: Date.now(),
      });
    }
  });

  socket.on("close", () => {
    clearTimeout(joinTimeout);
    if (meta.room) {
      meta.room.removePlayer(socket);
      meta.room = null;
    }
  });

  socket.on("error", (err) => {
    console.error(JSON.stringify({ level: "error", event: "ws.error", err: err.message }));
  });
});

const heartbeat = setInterval(() => {
  for (const client of wss.clients) {
    const meta = socketMeta.get(client);
    if (!meta) continue;
    if (!meta.alive) {
      client.terminate();
      continue;
    }
    meta.alive = false;
    client.ping();
  }
}, 15000);

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(JSON.stringify({ level: "info", event: "server.shutdown", signal }));

  clearInterval(heartbeat);
  for (const client of wss.clients) {
    client.send(JSON.stringify({ type: "shutdown", reason: "Server restarting" }));
    client.close(1001, "Server shutting down");
  }

  wss.close();
  server.close();
  await roomManager.closeAll();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

server.listen(config.port, config.host, () => {
  console.log(
    JSON.stringify({
      level: "info",
      event: "server.listening",
      host: config.host,
      port: config.port,
    })
  );
});
