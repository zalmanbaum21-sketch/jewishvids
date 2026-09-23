import { asc, desc, eq, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  AccessCode,
  InsertAccessCode,
  InsertUser,
  InsertVideo,
  InsertVideoUploadChunk,
  InsertVideoUploadSession,
  accessCodes,
  users,
  videoUploadChunks,
  videoUploadSessions,
  videos,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  type TextField = (typeof textFields)[number];

  const assignNullable = (field: TextField) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  };

  textFields.forEach(assignNullable);
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

function requireDb() {
  if (!_db) throw new Error("Database is not available");
  return _db;
}

export async function hasAccessCode(code: string) {
  const db = await getDb();
  if (!db) return false;
  const result = await db.select({ id: accessCodes.id }).from(accessCodes).where(eq(accessCodes.code, code)).limit(1);
  return result.length > 0;
}

export async function listAccessCodes(): Promise<AccessCode[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(accessCodes).orderBy(desc(accessCodes.createdAt));
}

export async function createAccessCode(code: string) {
  const db = requireDb();
  const values: InsertAccessCode = { code };
  const result = await db.insert(accessCodes).values(values);
  return result;
}

export async function deleteAccessCode(id: number) {
  const db = requireDb();
  return db.delete(accessCodes).where(eq(accessCodes.id, id));
}

export async function listVideos() {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: videos.id,
    title: videos.title,
    artist: videos.artist,
    originalName: videos.originalName,
    mimeType: videos.mimeType,
    sizeBytes: videos.sizeBytes,
    storageKey: videos.storageKey,
    storageUrl: videos.storageUrl,
    thumbnailKey: videos.thumbnailKey,
    thumbnailUrl: videos.thumbnailUrl,
    thumbnailMimeType: videos.thumbnailMimeType,
    thumbnailSizeBytes: videos.thumbnailSizeBytes,
    createdAt: videos.createdAt,
  }).from(videos).orderBy(desc(videos.createdAt));
}

export async function createVideo(video: InsertVideo) {
  const db = requireDb();
  const result = await db.insert(videos).values(video);
  return result;
}

export async function getVideoById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(videos).where(eq(videos.id, id)).limit(1);
  return result[0];
}

export async function getVideoByStorageKey(storageKey: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select({ id: videos.id }).from(videos).where(or(eq(videos.storageKey, storageKey), eq(videos.thumbnailKey, storageKey))).limit(1);
  return result[0];
}

export async function updateVideoMetadata(
  id: number,
  values: Pick<InsertVideo, "title" | "artist" | "thumbnailKey" | "thumbnailUrl" | "thumbnailMimeType" | "thumbnailSizeBytes">,
) {
  const db = requireDb();
  return db.update(videos).set(values).where(eq(videos.id, id));
}

export async function deleteVideo(id: number) {
  const db = requireDb();
  return db.delete(videos).where(eq(videos.id, id));
}

export async function createVideoUploadSession(session: InsertVideoUploadSession) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(videoUploadSessions).values(session);
  return session;
}

export async function getVideoUploadSession(id: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(videoUploadSessions).where(eq(videoUploadSessions.id, id)).limit(1);
  return result[0];
}

export async function saveVideoUploadChunk(chunk: InsertVideoUploadChunk) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(videoUploadChunks).values(chunk).onDuplicateKeyUpdate({
    set: {
      sizeBytes: chunk.sizeBytes,
      storageKey: chunk.storageKey,
      storageUrl: chunk.storageUrl,
    },
  });
  return chunk;
}

export async function listVideoUploadChunks(uploadId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(videoUploadChunks).where(eq(videoUploadChunks.uploadId, uploadId)).orderBy(asc(videoUploadChunks.chunkIndex));
}

export async function deleteVideoUploadSession(id: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(videoUploadChunks).where(eq(videoUploadChunks.uploadId, id));
  return db.delete(videoUploadSessions).where(eq(videoUploadSessions.id, id));
}
