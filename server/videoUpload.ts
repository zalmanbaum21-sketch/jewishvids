import crypto from "node:crypto";
import type { Express, Request, Response } from "express";
import { isValidThumbnailUpload, isValidVideoUpload, readAccessSessions } from "./access";
import { ENV } from "./_core/env";
import { vcdnStorageKey, vcdnStorageUrl } from "./storage";

const VCDN_BASE_URL = "https://cdn.vcdn.me";
const VCDN_CHUNK_SIZE = 8 * 1024 * 1024;

function firstHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function decodeFileName(value: string | undefined) {
  if (!value) return "video";
  try { return decodeURIComponent(value); } catch { return value; }
}

async function requireUploadAccess(req: Request, res: Response) {
  const access = await readAccessSessions(req);
  if (!access.viewer) { res.status(403).json({ message: "Unlock the video library before uploading." }); return false; }
  if (!access.admin) { res.status(403).json({ message: "Admin code required" }); return false; }
  return true;
}

async function uploadThumbnailToCloudinary(req: Request, fileName: string, mimeType: string, sizeBytes: number) {
  if (!ENV.cloudinaryCloudName || !ENV.cloudinaryApiKey || !ENV.cloudinaryApiSecret) {
    throw new Error("Thumbnail storage is not configured. Add the Cloudinary environment variables in Render, or upload without a thumbnail.");
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > 10 * 1024 * 1024) throw new Error("Thumbnail is larger than 10 MB.");
    chunks.push(buffer);
  }
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = "jewish-videos/thumbnails";
  const signatureBase = `folder=${folder}&timestamp=${timestamp}`;
  const signature = crypto.createHash("sha1").update(signatureBase + ENV.cloudinaryApiSecret).digest("hex");
  const form = new FormData();
  form.append("file", new Blob([Buffer.concat(chunks)], { type: mimeType }), fileName);
  form.append("api_key", ENV.cloudinaryApiKey);
  form.append("timestamp", String(timestamp));
  form.append("folder", folder);
  form.append("signature", signature);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${ENV.cloudinaryCloudName}/image/upload`, { method: "POST", body: form });
  const body = await response.json().catch(() => ({})) as { public_id?: string; secure_url?: string; error?: { message?: string } };
  if (!response.ok || !body.secure_url || !body.public_id) throw new Error(body.error?.message || `Thumbnail upload failed (${response.status})`);
  return { key: `cloudinary/${body.public_id}`, url: body.secure_url };
}

export function registerVideoUploadRoute(app: Express) {
  app.post("/api/video-upload", async (req: Request, res: Response) => {
    if (!(await requireUploadAccess(req, res))) return;
    const fileName = decodeFileName(firstHeader(req.headers["x-file-name"]));
    const uploadRole = firstHeader(req.headers["x-upload-role"]) || "video";
    const mimeType = firstHeader(req.headers["x-file-type"]) || "application/octet-stream";
    const declaredSize = Number(firstHeader(req.headers["x-file-size"]));
    const requestSize = Number(firstHeader(req.headers["content-length"]));
    if (uploadRole !== "thumbnail" || !isValidThumbnailUpload({ fileName, mimeType, sizeBytes: declaredSize }) || declaredSize !== requestSize) {
      return res.status(400).json({ message: "Invalid thumbnail metadata. Use an image no larger than 10 MB." });
    }
    try {
      const upload = await uploadThumbnailToCloudinary(req, fileName, mimeType, declaredSize);
      return res.status(201).json(upload);
    } catch (error) {
      console.error("[VideoUpload] thumbnail upload failed:", error);
      return res.status(502).json({ message: error instanceof Error ? error.message : "Thumbnail upload failed. Please retry." });
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
    if (!isValidVideoUpload({ fileName, mimeType, sizeBytes }) || totalChunks !== Math.ceil(sizeBytes / VCDN_CHUNK_SIZE)) {
      return res.status(400).json({ message: "Invalid resumable video metadata. Videos must be no larger than 3 GB." });
    }
    if (!ENV.vcdnApiKey) return res.status(503).json({ message: "VCDN storage is not configured yet." });
    try {
      const response = await fetch(`${VCDN_BASE_URL}/api/v1/upload/init`, {
        method: "POST",
        headers: { "X-API-Key": ENV.vcdnApiKey, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ filename: fileName, size: sizeBytes, contentType: mimeType, title: fileName, ladderProfile: "standard" }),
      });
      const body = await response.json().catch(() => ({})) as { uploadId?: string; videoId?: string; message?: string };
      if (!response.ok || !body.uploadId) return res.status(502).json({ message: body.message || `VCDN upload initialization failed (${response.status}).` });
      return res.status(201).json({ uploadId: body.uploadId, videoId: body.videoId || body.uploadId, chunkSize: VCDN_CHUNK_SIZE, totalChunks });
    } catch (error) {
      console.error("[VideoUpload] VCDN init failed:", error);
      return res.status(502).json({ message: "VCDN could not start the upload. Please retry." });
    }
  });

  app.post("/api/video-upload/chunk", async (req: Request, res: Response) => {
    if (!(await requireUploadAccess(req, res))) return;
    const uploadId = firstHeader(req.headers["x-upload-id"]);
    const chunkIndex = Number(firstHeader(req.headers["x-chunk-index"]));
    const requestSize = Number(firstHeader(req.headers["content-length"]));
    if (!uploadId || !Number.isSafeInteger(chunkIndex) || !Number.isSafeInteger(requestSize) || requestSize <= 0 || requestSize > VCDN_CHUNK_SIZE) return res.status(400).json({ message: "Invalid upload chunk metadata." });
    if (!ENV.vcdnApiKey) return res.status(503).json({ message: "VCDN storage is not configured yet." });
    try {
      const response = await fetch(`${VCDN_BASE_URL}/api/v1/upload/${encodeURIComponent(uploadId)}/chunk`, {
        method: "POST",
        headers: { "X-API-Key": ENV.vcdnApiKey, "Content-Type": "application/octet-stream", "Content-Length": String(requestSize) },
        body: req as any,
        // @ts-expect-error Node fetch accepts streaming request bodies with this flag.
        duplex: "half",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { message?: string };
        return res.status(502).json({ message: body.message || `VCDN chunk upload failed (${response.status}).` });
      }
      return res.status(201).json({ success: true, chunkIndex });
    } catch (error) {
      console.error("[VideoUpload] VCDN chunk failed:", error);
      return res.status(502).json({ message: "VCDN chunk upload failed. Please retry this chunk." });
    }
  });

  app.post("/api/video-upload/complete", async (req: Request, res: Response) => {
    if (!(await requireUploadAccess(req, res))) return;
    const uploadId = firstHeader(req.headers["x-upload-id"]);
    if (!uploadId) return res.status(400).json({ message: "Upload session is required." });
    if (!ENV.vcdnApiKey) return res.status(503).json({ message: "VCDN storage is not configured yet." });
    try {
      const response = await fetch(`${VCDN_BASE_URL}/api/v1/upload/complete`, {
        method: "POST",
        headers: { "X-API-Key": ENV.vcdnApiKey, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ uploadId }),
      });
      const body = await response.json().catch(() => ({})) as { videoId?: string; id?: string; message?: string };
      if (!response.ok) return res.status(502).json({ message: body.message || `VCDN could not finalize the upload (${response.status}).` });
      const videoId = body.videoId || body.id || uploadId;
      return res.status(201).json({ key: vcdnStorageKey(videoId), url: vcdnStorageUrl(videoId) });
    } catch (error) {
      console.error("[VideoUpload] VCDN complete failed:", error);
      return res.status(502).json({ message: "VCDN could not finalize the upload. Please retry." });
    }
  });
}
