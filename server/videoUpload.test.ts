import { describe, expect, it } from "vitest";
import type { Express, Request, Response } from "express";
import { createAdminSession, createViewerSession } from "./access";
import { registerResumableVideoUploadRoutes, registerVideoUploadRoute } from "./videoUpload";

function getHandler() {
  let handler: ((req: Request, res: Response) => Promise<void>) | undefined;
  const app = {
    post: (_path: string, callback: (req: Request, res: Response) => Promise<void>) => {
      handler = callback;
    },
  } as unknown as Express;
  registerVideoUploadRoute(app);
  if (!handler) throw new Error("Upload route was not registered");
  return handler;
}

function getResumableHandler(path: string) {
  let handler: ((req: Request, res: Response) => Promise<void>) | undefined;
  const app = {
    post: (registeredPath: string, callback: (req: Request, res: Response) => Promise<void>) => {
      if (registeredPath === path) handler = callback;
    },
  } as unknown as Express;
  registerResumableVideoUploadRoutes(app);
  if (!handler) throw new Error(`Route was not registered: ${path}`);
  return handler;
}

function createResponse() {
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    headersSent: false,
    status(code: number) {
      response.statusCode = code;
      return response;
    },
    json(body: unknown) {
      response.body = body;
      return response;
    },
  } as unknown as Response & { statusCode: number; body: unknown };
  return response;
}

describe("video upload route", () => {
  it("requires a viewer session before upload access", async () => {
    const handler = getHandler();
    const response = createResponse();
    await handler({ headers: {} } as Request, response);
    expect(response.statusCode).toBe(403);
    expect(response.body).toEqual({ message: "Unlock the video library before uploading." });
  });

  it("requires the separate admin session after viewer unlock", async () => {
    const handler = getHandler();
    const response = createResponse();
    const viewerToken = await createViewerSession("123456");
    await handler({ headers: { cookie: `jewish_videos_viewer=${viewerToken}` } } as Request, response);
    expect(response.statusCode).toBe(403);
    expect(response.body).toEqual({ message: "Admin code required" });
  });

  it("rejects metadata above the 3 GB limit before opening storage", async () => {
    const handler = getHandler();
    const response = createResponse();
    const adminToken = await createAdminSession();
    const viewerToken = await createViewerSession("123456");
    await handler(
      {
        headers: {
          cookie: `jewish_videos_viewer=${viewerToken}; jewish_videos_admin=${adminToken}`,
          "x-file-name": "large.mp4",
          "x-file-type": "video/mp4",
          "x-file-size": String(3 * 1024 * 1024 * 1024 + 1),
          "content-length": String(3 * 1024 * 1024 * 1024 + 1),
        },
      } as Request,
      response,
    );
    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({ message: "Invalid video metadata. Files must be video files no larger than 3 GB." });
  });
});

describe("resumable video upload routes", () => {
  it("requires viewer unlock before starting a resumable session", async () => {
    const handler = getResumableHandler("/api/video-upload/session");
    const response = createResponse();
    await handler({ headers: {} } as Request, response);
    expect(response.statusCode).toBe(403);
    expect(response.body).toEqual({ message: "Unlock the video library before uploading." });
  });

  it("requires viewer unlock before finalizing a resumable session", async () => {
    const handler = getResumableHandler("/api/video-upload/complete");
    const response = createResponse();
    await handler({ headers: { "x-upload-id": "missing" } } as Request, response);
    expect(response.statusCode).toBe(403);
    expect(response.body).toEqual({ message: "Unlock the video library before uploading." });
  });

  it("requires the separate admin session after viewer unlock", async () => {
    const handler = getResumableHandler("/api/video-upload/session");
    const response = createResponse();
    const viewerToken = await createViewerSession("123456");
    await handler({ headers: { cookie: `jewish_videos_viewer=${viewerToken}` } } as Request, response);
    expect(response.statusCode).toBe(403);
    expect(response.body).toEqual({ message: "Admin code required" });
  });

  it("requires the separate admin session on chunk upload", async () => {
    const handler = getResumableHandler("/api/video-upload/chunk");
    const response = createResponse();
    const viewerToken = await createViewerSession("123456");
    await handler({ headers: { cookie: `jewish_videos_viewer=${viewerToken}`, "x-upload-id": "missing", "x-chunk-index": "0", "content-length": "1" } } as Request, response);
    expect(response.statusCode).toBe(403);
    expect(response.body).toEqual({ message: "Admin code required" });
  });
});

describe("thumbnail upload route", () => {
  it("rejects a thumbnail above 10 MB before opening storage", async () => {
    const handler = getHandler();
    const response = createResponse();
    const adminToken = await createAdminSession();
    const viewerToken = await createViewerSession("123456");
    const size = 10 * 1024 * 1024 + 1;
    await handler(
      {
        headers: {
          cookie: `jewish_videos_viewer=${viewerToken}; jewish_videos_admin=${adminToken}`,
          "x-file-name": "cover.jpg",
          "x-file-type": "image/jpeg",
          "x-file-size": String(size),
          "x-upload-role": "thumbnail",
          "content-length": String(size),
        },
      } as Request,
      response,
    );
    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({ message: "Invalid thumbnail metadata. Use an image no larger than 10 MB." });
  });
});
