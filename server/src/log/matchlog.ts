import { createWriteStream, mkdirSync } from "node:fs";
import { join } from "node:path";
import { PassThrough, Transform, type TransformCallback } from "node:stream";
import { pipeline } from "node:stream/promises";

export interface MatchEvent {
  readonly t: number;
  readonly room: string;
  readonly type: string;
  readonly payload?: unknown;
}

class NdjsonTransform extends Transform {
  constructor() {
    super({ writableObjectMode: true });
  }

  override _transform(chunk: MatchEvent, _enc: BufferEncoding, callback: TransformCallback): void {
    try {
      callback(null, `${JSON.stringify(chunk)}\n`);
    } catch (err) {
      callback(err instanceof Error ? err : new Error(String(err)));
    }
  }
}

export class MatchLogger {
  readonly #input = new PassThrough({ objectMode: true });
  readonly #done: Promise<void>;

  constructor(logDir: string, roomId: string) {
    mkdirSync(logDir, { recursive: true });
    const safeRoom = roomId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const filePath = join(logDir, `${safeRoom}-${Date.now()}.ndjson`);
    const fileStream = createWriteStream(filePath, { flags: "a" });
    const transform = new NdjsonTransform();

    this.#done = pipeline(this.#input, transform, fileStream).catch((err) => {
      console.error(JSON.stringify({ level: "error", event: "matchlog.error", err: String(err) }));
    });
  }

  write(event: MatchEvent): void {
    if (!this.#input.writableEnded) {
      this.#input.write(event);
    }
  }

  async close(): Promise<void> {
    this.#input.end();
    await this.#done;
  }
}
