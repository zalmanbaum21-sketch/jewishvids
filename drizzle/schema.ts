import {
  bigint,
  int,
  index,
  mysqlEnum,
  uniqueIndex,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const accessCodes = mysqlTable(
  "access_codes",
  {
    id: int("id").autoincrement().primaryKey(),
    code: varchar("code", { length: 6 }).notNull().unique(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    codeIndex: index("access_codes_code_idx").on(table.code),
  }),
);

export type AccessCode = typeof accessCodes.$inferSelect;
export type InsertAccessCode = typeof accessCodes.$inferInsert;

export const videos = mysqlTable(
  "videos",
  {
    id: int("id").autoincrement().primaryKey(),
    title: varchar("title", { length: 255 }).notNull(),
    artist: varchar("artist", { length: 255 }),
    originalName: varchar("originalName", { length: 255 }).notNull(),
    mimeType: varchar("mimeType", { length: 128 }).notNull(),
    sizeBytes: bigint("sizeBytes", { mode: "number" }).notNull(),
    storageKey: varchar("storageKey", { length: 512 }).notNull().unique(),
    storageUrl: varchar("storageUrl", { length: 768 }).notNull(),
    thumbnailKey: varchar("thumbnailKey", { length: 512 }),
    thumbnailUrl: varchar("thumbnailUrl", { length: 768 }),
    thumbnailMimeType: varchar("thumbnailMimeType", { length: 128 }),
    thumbnailSizeBytes: bigint("thumbnailSizeBytes", { mode: "number" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    createdAtIndex: index("videos_created_at_idx").on(table.createdAt),
  }),
);

export type Video = typeof videos.$inferSelect;
export type InsertVideo = typeof videos.$inferInsert;

export const videoUploadSessions = mysqlTable(
  "video_upload_sessions",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    fileName: varchar("fileName", { length: 255 }).notNull(),
    mimeType: varchar("mimeType", { length: 128 }).notNull(),
    sizeBytes: bigint("sizeBytes", { mode: "number" }).notNull(),
    totalChunks: int("totalChunks").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    createdAtIndex: index("video_upload_sessions_created_at_idx").on(table.createdAt),
  }),
);

export type VideoUploadSession = typeof videoUploadSessions.$inferSelect;
export type InsertVideoUploadSession = typeof videoUploadSessions.$inferInsert;

export const videoUploadChunks = mysqlTable(
  "video_upload_chunks",
  {
    id: int("id").autoincrement().primaryKey(),
    uploadId: varchar("uploadId", { length: 64 }).notNull(),
    chunkIndex: int("chunkIndex").notNull(),
    sizeBytes: int("sizeBytes").notNull(),
    storageKey: varchar("storageKey", { length: 512 }).notNull().unique(),
    storageUrl: varchar("storageUrl", { length: 768 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    uploadChunkUnique: uniqueIndex("video_upload_chunks_upload_idx").on(table.uploadId, table.chunkIndex),
    uploadIdIndex: index("video_upload_chunks_upload_id_idx").on(table.uploadId),
  }),
);

export type VideoUploadChunk = typeof videoUploadChunks.$inferSelect;
export type InsertVideoUploadChunk = typeof videoUploadChunks.$inferInsert;
