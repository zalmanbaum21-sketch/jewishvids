import type { Request, Response } from "express";
import { parse } from "cookie";
import { sdk } from "./_core/sdk";
import { getSessionCookieOptions } from "./_core/cookies";

export const VIEWER_COOKIE = "jewish_videos_viewer";
export const ADMIN_COOKIE = "jewish_videos_admin";
export const ADMIN_CODE = "112034";
export const MAX_VIDEO_BYTES = 3 * 1024 * 1024 * 1024;
export const MAX_THUMBNAIL_BYTES = 10 * 1024 * 1024;
const VIEWER_SESSION_MS = 1000 * 60 * 60 * 24 * 30;
const ADMIN_SESSION_MS = 1000 * 60 * 60 * 8;

export type AccessSessions = {
  viewer: { code: string } | null;
  admin: boolean;
};

export function isValidViewerCode(code: string) {
  return /^\d{6}$/.test(code);
}

export function isValidVideoUpload(input: {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}) {
  return (
    input.fileName.trim().length > 0 &&
    input.fileName.length <= 255 &&
    input.mimeType.startsWith("video/") &&
    Number.isSafeInteger(input.sizeBytes) &&
    input.sizeBytes > 0 &&
    input.sizeBytes <= MAX_VIDEO_BYTES
  );
}

export function isValidThumbnailUpload(input: {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}) {
  return (
    input.fileName.trim().length > 0 &&
    input.fileName.length <= 255 &&
    input.mimeType.startsWith("image/") &&
    Number.isSafeInteger(input.sizeBytes) &&
    input.sizeBytes > 0 &&
    input.sizeBytes <= MAX_THUMBNAIL_BYTES
  );
}

export async function readAccessSessions(req: Request): Promise<AccessSessions> {
  const cookies = parse(req.headers.cookie ?? "");
  const viewer = await sdk.verifySession(cookies[VIEWER_COOKIE]);
  const admin = await sdk.verifySession(cookies[ADMIN_COOKIE]);

  return {
    viewer:
      viewer?.openId.startsWith("jewish-viewer:") && isValidViewerCode(viewer.openId.slice("jewish-viewer:".length))
        ? { code: viewer.openId.slice("jewish-viewer:".length) }
        : null,
    admin: admin?.openId === "jewish-admin",
  };
}

export async function createViewerSession(code: string) {
  return sdk.signSession(
    { openId: `jewish-viewer:${code}`, appId: "jewish-videos", name: "viewer" },
    { expiresInMs: VIEWER_SESSION_MS },
  );
}

export async function createAdminSession() {
  return sdk.signSession(
    { openId: "jewish-admin", appId: "jewish-videos", name: "admin" },
    { expiresInMs: ADMIN_SESSION_MS },
  );
}

export function setViewerCookie(req: Request, res: Response, token: string) {
  res.cookie(VIEWER_COOKIE, token, {
    ...getSessionCookieOptions(req),
    maxAge: VIEWER_SESSION_MS,
  });
}

export function setAdminCookie(req: Request, res: Response, token: string) {
  res.cookie(ADMIN_COOKIE, token, {
    ...getSessionCookieOptions(req),
    maxAge: ADMIN_SESSION_MS,
  });
}

export function clearViewerCookie(req: Request, res: Response) {
  res.clearCookie(VIEWER_COOKIE, getSessionCookieOptions(req));
}

export function clearAdminCookie(req: Request, res: Response) {
  res.clearCookie(ADMIN_COOKIE, getSessionCookieOptions(req));
}
