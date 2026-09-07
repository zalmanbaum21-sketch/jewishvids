import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import type { Express, Request, Response } from "express";
import {
  createVideoUploadSession,
  deleteVideoUploadSession,
  getVideoUploadSession,
  listVideoUploadChunks,
  saveVideoUploadChunk,
} from "./db";
import { isValidThumbnailUpload, isValidVideoUpload, readAccessSessions } from "./access";
import { storageGetSignedUrl, storagePutStream } from "./storage";

export const VIDEO_UPLOAD_CHUNK_SIZE = 16 * 1024 * 1024;

function firstHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function decodeFileName(value: string | undefined) {
  if (!value) return "video";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function requireUploadAccess(req: Request, res: Response) {
  const access = await readAccessSessions(req);
  if (!access.viewer) {
    res.status(403).json({ message: "Unlock the video library before uploading." });
    return false;
  }
  if (!access.admin) {
    res.status(403).json({ message: "Admin code required" });
    return false;
  }
  return true;
}

async function streamStoredChunks(uploadId: string, chunkKeys: string[]) {
  async function* source() {
    for (const chunkKey of chunkKeys) {
      const signedUrl = await storageGetSignedUrl(chunkKey);
      const response = await fetch(signedUrl);
      if (!response.ok || !response.body) throw new Error(`Stored upload chunk could not be read (${response.status})`);
      const readable = Readable.fromWeb(response.body as never);
      for await (const piece of readable) yield piece as Buffer;
    }
  }
  return Readable.toWeb(Readable.from(source())) as ReadableStream<Uint8Array>;
}

export function registerVideoUploadRoute(app: Express) {
  app.post("/api/video-upload", async (req: Request, res: Response) => {
    if (!(await requireUploadAccess(req, res))) return;

    const fileName = decodeFileName(firstHeader(req.headers["x-file-name"]));
    const uploadRole = firstHeader(req.headers["x-upload-role"]) || "video";
    const mimeType = firstHeader(req.headers["x-file-type"]) || "application/octet-stream";
    const declaredSize = Number(firstHeader(req.headers["x-file-size"]));
    const requestSize = Number(firstHeader(req.headers["content-length"]));

    const metadataIsValid = uploadRole === "thumbnail"
      ? isValidThumbnailUpload({ fileName, mimeType, sizeBytes: declaredSize })
      : uploadRole === "video" && isValidVideoUpload({ fileName, mimeType, sizeBytes: declaredSize });
    if (!Number.isSafeInteger(declaredSize) || declaredSize !== requestSize || !metadataIsValid) {
      res.status(400).json({ message: uploadRole === "thumbnail" ? "Invalid thumbnail metadata. Use an image no larger than 10 MB." : "Invalid video metadata. Files must be video files no larger than 3 GB." });
      return;
    }

    try {
      const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
      const upload = await storagePutStream(
        `jewish-videos/${uploadRole === "thumbnail" ? "thumbnails" : "videos"}/${Date.now()}-${safeName}`,
        Readable.toWeb(req) as ReadableStream<Uint8Array>,
        mimeType,
        declaredSize,
      );
      res.status(201).json(upload);
    } catch (error) {
      console.error("[VideoUpload] streaming upload failed:", error);
      if (!res.headersSent) res.status(502).json({ message: "Storage upload failed. Please retry." });
    }
  });
}

export function registerResumableVideoUploadRoutes(app: Express) {
  app.post("/api/video-upload/session", async (req: Request, res: Response) => {
    if (!(await requireUploadAccess(req, res))) return;
    const fileName = decodeFileName(firstHeader(req.headers["x-file-name"]));
    const mimeType = firstHeader(req.headers["x-file-type"]) || "application/octet-stream";
    const sizeBytes = Number(firstHeader(req.headers["x-file-size"]));
    const totalChunks = Number(firstHeader(req.headers["x-total-chunks"]));
    if (!isValidVideoUpload({ fileName, mimeType, sizeBytes }) || !Number.isSafeInteger(totalChunks) || totalChunks !== Math.ceil(sizeBytes / VIDEO_UPLOAD_CHUNK_SIZE)) {
      res.status(400).json({ message: "Invalid resumable video metadata." });
      return;
    }
    const session = await createVideoUploadSession({ id: randomUUID(), fileName, mimeType, sizeBytes, totalChunks });
    res.status(201).json({ uploadId: session.id, chunkSize: VIDEO_UPLOAD_CHUNK_SIZE, totalChunks: session.totalChunks });
  });

  app.post("/api/video-upload/chunk", async (req: Request, res: Response) => {
    if (!(await requireUploadAccess(req, res))) return;
    const uploadId = firstHeader(req.headers["x-upload-id"]);
    const chunkIndex = Number(firstHeader(req.headers["x-chunk-index"]));
    const requestSize = Number(firstHeader(req.headers["content-length"]));
    if (!uploadId || !Number.isSafeInteger(chunkIndex) || !Number.isSafeInteger(requestSize) || requestSize <= 0 || requestSize > VIDEO_UPLOAD_CHUNK_SIZE) {
      res.status(400).json({ message: "Invalid upload chunk metadata." });
      return;
    }
    const session = await getVideoUploadSession(uploadId);
    if (!session || chunkIndex < 0 || chunkIndex >= session.totalChunks) {
      res.status(404).json({ message: "Upload session not found." });
      return;
    }
    const expectedSize = Math.min(VIDEO_UPLOAD_CHUNK_SIZE, session.sizeBytes - chunkIndex * VIDEO_UPLOAD_CHUNK_SIZE);
    if (requestSize !== expectedSize) {
      res.status(400).json({ message: "Upload chunk size does not match the session." });
      return;
    }
    try {
      const safeName = session.fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
      const upload = await storagePutStream(
        `jewish-videos/upload-parts/${uploadId}/${chunkIndex}-${safeName}`,
        Readable.toWeb(req) as ReadableStream<Uint8Array>,
        session.mimeType,
        requestSize,
      );
      await saveVideoUploadChunk({ uploadId, chunkIndex, sizeBytes: requestSize, storageKey: upload.key, storageUrl: upload.url });
      res.status(201).json({ success: true, chunkIndex });
    } catch (error) {
      console.error("[VideoUpload] chunk upload failed:", error);
      if (!res.headersSent) res.status(502).json({ message: "Storage chunk upload failed. Please retry this chunk." });
    }
  });

  app.post("/api/video-upload/complete", async (req: Request, res: Response) => {
    if (!(await requireUploadAccess(req, res))) return;
    const uploadId = firstHeader(req.headers["x-upload-id"]);
    if (!uploadId) {
      res.status(400).json({ message: "Upload session is required." });
      return;
    }
    const session = await getVideoUploadSession(uploadId);
    if (!session) {
      res.status(404).json({ message: "Upload session not found." });
      return;
    }
    const chunks = await listVideoUploadChunks(uploadId);
    const isComplete = chunks.length === session.totalChunks
      && chunks.every((chunk, index) => chunk.chunkIndex === index)
      && chunks.reduce((total, chunk) => total + chunk.sizeBytes, 0) === session.sizeBytes;
    if (!isComplete) {
      res.status(409).json({ message: "Some upload chunks are missing. Please retry the upload." });
      return;
    }
    try {
      const safeName = session.fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
      const upload = await storagePutStream(
        `jewish-videos/videos/${Date.now()}-${safeName}`,
        await streamStoredChunks(uploadId, chunks.map(chunk => chunk.storageKey)),
        session.mimeType,
        session.sizeBytes,
      );
      await deleteVideoUploadSession(uploadId);
      res.status(201).json(upload);
    } catch (error) {
      console.error("[VideoUpload] chunk assembly failed:", error);
      if (!res.headersSent) res.status(502).json({ message: "Storage assembly failed. Please retry finalizing the upload." });
    }
  });
}
