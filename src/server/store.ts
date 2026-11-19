/**
 * Server-side record store for RAMSport.
 *
 * Every account, project file, profile, remembered save location, audit entry
 * and module scratchpad is persisted on the server. The browser never owns the
 * data: it only holds an HttpOnly session cookie.
 *
 * Two drivers are supported behind one interface:
 *
 * - `mongodb` when `MONGODB_URI` is set. This is the production driver: it
 *   survives redeploys and works across multiple serverless instances.
 * - `file` otherwise. A local, atomic JSON store under `RAMSPORT_DATA_DIR`.
 *   This keeps `next dev` and single-server installs working without MongoDB,
 *   but it is *not* durable on an ephemeral serverless filesystem. Set
 *   `MONGODB_URI` before deploying to Vercel or any host without a persistent
 *   disk.
 *
 * Records are whole JSON documents keyed by a namespaced string. Updates use
 * optimistic concurrency (MongoDB) or a per-key queue plus atomic rename
 * (filesystem) so two simultaneous saves cannot silently overwrite each other.
 */

import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export class StorageWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageWriteError";
  }
}

type RecordDocument = { value: unknown; version: number; updatedAt: Date };

const MONGO_URI = process.env.MONGODB_URI?.trim() || "";
const MONGO_DATABASE = process.env.MONGODB_DATABASE?.trim() || "ramsport";
const DATA_DIR = process.env.RAMSPORT_DATA_DIR?.trim()
  || (process.env.VERCEL ? path.join(tmpdir(), "ramsport-data") : path.join(process.cwd(), ".ramsport-data"));

let warnedAboutEphemeralStorage = false;

function warnIfNotDurable() {
  if (MONGO_URI || warnedAboutEphemeralStorage) return;
  if (process.env.NODE_ENV !== "production") return;
  warnedAboutEphemeralStorage = true;
  console.warn(
    "[RAMSport] MONGODB_URI is not set. Falling back to local filesystem storage at "
    + `${DATA_DIR}. On serverless hosts this disk is ephemeral and data will be lost on redeploy.`,
  );
}

/* -------------------------------------------------------------------------- */
/* MongoDB driver                                                              */
/* -------------------------------------------------------------------------- */

type MongoCollection = {
  findOne(filter: Record<string, unknown>): Promise<RecordDocument | null>;
  updateOne(
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<{ matchedCount: number; upsertedCount: number }>;
  deleteOne(filter: Record<string, unknown>): Promise<unknown>;
};

let mongoCollectionPromise: Promise<MongoCollection> | null = null;

async function mongoCollection(): Promise<MongoCollection> {
  if (!mongoCollectionPromise) {
    mongoCollectionPromise = (async () => {
      const { MongoClient } = await import("mongodb");
      const client = new MongoClient(MONGO_URI, {
        appName: "ramsport",
        serverSelectionTimeoutMS: 8_000,
        connectTimeoutMS: 8_000,
      });
      await client.connect();
      return client.db(MONGO_DATABASE).collection("records") as unknown as MongoCollection;
    })().catch(error => {
      mongoCollectionPromise = null;
      throw error;
    });
  }
  return mongoCollectionPromise;
}

/* -------------------------------------------------------------------------- */
/* Filesystem driver                                                           */
/* -------------------------------------------------------------------------- */

const queues = new Map<string, Promise<unknown>>();

function withFileLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve();
  const next = previous.then(task, task);
  const guard = next.then(() => undefined, () => undefined);
  queues.set(key, guard);
  // Drop the queue entry once it is the settled tail, so long-running servers
  // do not accumulate one promise per record key they have ever touched.
  void guard.then(() => {
    if (queues.get(key) === guard) queues.delete(key);
  });
  return next;
}

function recordPath(key: string) {
  const digest = createHash("sha256").update(key).digest("hex");
  return path.join(DATA_DIR, "records", `${digest}.json`);
}

async function readFileDocument(key: string): Promise<RecordDocument | null> {
  try {
    const raw = await readFile(recordPath(key), "utf8");
    const parsed = JSON.parse(raw) as Partial<RecordDocument> & { key?: string };
    if (parsed.key !== key || !("value" in parsed)) return null;
    return {
      value: parsed.value,
      version: typeof parsed.version === "number" ? parsed.version : 1,
      updatedAt: parsed.updatedAt ? new Date(parsed.updatedAt) : new Date(0),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function writeFileDocument(key: string, value: unknown, version: number) {
  const target = recordPath(key);
  const directory = path.dirname(target);
  await mkdir(directory, { recursive: true });
  const temporary = `${target}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify({ key, value, version, updatedAt: new Date().toISOString() }), {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporary, target);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw new StorageWriteError(
      `The server could not persist workspace data. ${(error as Error).message}`,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Public interface                                                            */
/* -------------------------------------------------------------------------- */

export function usingMongo(): boolean {
  return Boolean(MONGO_URI);
}

export function storageDescription(): string {
  return MONGO_URI ? "MongoDB" : `server filesystem (${DATA_DIR})`;
}

export async function readRecord<T>(key: string): Promise<T | null> {
  warnIfNotDurable();
  if (MONGO_URI) {
    const collection = await mongoCollection();
    const document = await collection.findOne({ _id: key });
    return document ? (document.value as T) : null;
  }
  const document = await readFileDocument(key);
  return document ? (document.value as T) : null;
}

export async function writeRecord(key: string, value: unknown): Promise<void> {
  warnIfNotDurable();
  if (MONGO_URI) {
    const collection = await mongoCollection();
    await collection.updateOne(
      { _id: key },
      { $set: { value, updatedAt: new Date() }, $inc: { version: 1 } },
      { upsert: true },
    );
    return;
  }
  await withFileLock(key, async () => {
    const current = await readFileDocument(key);
    await writeFileDocument(key, value, (current?.version ?? 0) + 1);
  });
}

/**
 * Atomically reads a record, lets `mutate` change it, and writes the result.
 * The mutator may run more than once under contention, so it must be a pure
 * function of the value it receives.
 */
export async function mutateRecord<T>(
  key: string,
  mutate: (current: unknown) => T | Promise<T>,
): Promise<T> {
  warnIfNotDurable();

  if (MONGO_URI) {
    const collection = await mongoCollection();
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const document = await collection.findOne({ _id: key });
      const next = await mutate(document ? document.value : null);
      if (document) {
        const result = await collection.updateOne(
          { _id: key, version: document.version },
          { $set: { value: next, updatedAt: new Date() }, $inc: { version: 1 } },
        );
        if (result.matchedCount) return next;
      } else {
        const result = await collection.updateOne(
          { _id: key },
          { $setOnInsert: { value: next, version: 1, updatedAt: new Date() } },
          { upsert: true },
        );
        if (result.upsertedCount) return next;
      }
    }
    throw new StorageWriteError("The workspace is busy. Please try that change again.");
  }

  return withFileLock(key, async () => {
    const document = await readFileDocument(key);
    const next = await mutate(document ? document.value : null);
    await writeFileDocument(key, next, (document?.version ?? 0) + 1);
    return next;
  });
}

export async function removeRecord(key: string): Promise<void> {
  warnIfNotDurable();
  if (MONGO_URI) {
    const collection = await mongoCollection();
    await collection.deleteOne({ _id: key });
    return;
  }
  await withFileLock(key, async () => {
    await unlink(recordPath(key)).catch(error => {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    });
  });
}

/* -------------------------------------------------------------------------- */
/* Session signing secret                                                      */
/* -------------------------------------------------------------------------- */

const SECRET_KEY = "system:session-secret";
let secretPromise: Promise<string> | null = null;

/**
 * A stable signing secret for session cookies. `RAMSPORT_SESSION_SECRET` wins;
 * otherwise a random secret is generated once and stored server-side so that
 * sessions survive a restart.
 */
export function getSessionSecret(): Promise<string> {
  const fromEnvironment = process.env.RAMSPORT_SESSION_SECRET?.trim();
  if (fromEnvironment && fromEnvironment.length >= 32) return Promise.resolve(fromEnvironment);
  if (!secretPromise) {
    secretPromise = mutateRecord<string>(SECRET_KEY, current => {
      if (typeof current === "string" && current.length >= 32) return current;
      return randomBytes(48).toString("base64url");
    }).catch(error => {
      secretPromise = null;
      throw error;
    });
  }
  return secretPromise;
}
