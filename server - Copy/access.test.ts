import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter } from "./routers";
import { ADMIN_CODE, MAX_THUMBNAIL_BYTES, MAX_VIDEO_BYTES, isValidThumbnailUpload, isValidVideoUpload, isValidViewerCode } from "./access";
import type { TrpcContext } from "./_core/context";

function createContext(overrides: Partial<TrpcContext> = {}): TrpcContext {
  return {
    user: null,
    viewer: null,
    admin: false,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
    ...overrides,
  };
}

describe("Jewish Videos access rules", () => {
  it("accepts only six-digit viewer codes", () => {
    expect(isValidViewerCode("123456")).toBe(true);
    expect(isValidViewerCode("12345")).toBe(false);
    expect(isValidViewerCode("12345a")).toBe(false);
  });

  it("keeps the admin code exact and separate", () => {
    expect(ADMIN_CODE).toBe("112034");
    expect(ADMIN_CODE).not.toBe("123456");
  });

  it("accepts video uploads through 3 GB and rejects larger or non-video files", () => {
    expect(isValidVideoUpload({ fileName: "lesson.mp4", mimeType: "video/mp4", sizeBytes: MAX_VIDEO_BYTES })).toBe(true);
    expect(isValidVideoUpload({ fileName: "lesson.mp4", mimeType: "video/mp4", sizeBytes: MAX_VIDEO_BYTES + 1 })).toBe(false);
    expect(isValidVideoUpload({ fileName: "notes.pdf", mimeType: "application/pdf", sizeBytes: 100 })).toBe(false);
  });

  it("accepts image thumbnails up to 10 MB and rejects other files", () => {
    expect(isValidThumbnailUpload({ fileName: "cover.jpg", mimeType: "image/jpeg", sizeBytes: MAX_THUMBNAIL_BYTES })).toBe(true);
    expect(isValidThumbnailUpload({ fileName: "cover.jpg", mimeType: "image/jpeg", sizeBytes: MAX_THUMBNAIL_BYTES + 1 })).toBe(false);
    expect(isValidThumbnailUpload({ fileName: "lesson.mp4", mimeType: "video/mp4", sizeBytes: 100 })).toBe(false);
  });

  it("blocks the library without a viewer or admin session", async () => {
    const caller = appRouter.createCaller(createContext());
    await expect(caller.library.list()).rejects.toMatchObject<TRPCError>({ code: "FORBIDDEN" });
  });

  it("does not treat a viewer session as admin access", async () => {
    const caller = appRouter.createCaller(createContext({ viewer: { code: "123456" } }));
    await expect(caller.admin.listVideos()).rejects.toMatchObject<TRPCError>({ code: "FORBIDDEN" });
  });

  it("does not allow the admin code to be exchanged before viewer unlock", async () => {
    const caller = appRouter.createCaller(createContext());
    await expect(caller.access.verifyAdmin({ code: ADMIN_CODE })).rejects.toMatchObject<TRPCError>({ code: "FORBIDDEN" });
  });
});

describe("Jewish Videos admin authorization", () => {
  it("blocks every admin mutation without the admin code session", async () => {
    const caller = appRouter.createCaller(createContext({ viewer: { code: "123456" } }));
    const checks = [
      caller.admin.addAccessCode({ code: "654321" }),
      caller.admin.deleteAccessCode({ id: 1 }),
      caller.admin.prepareUpload({ fileName: "lesson.mp4", mimeType: "video/mp4", sizeBytes: 100 }),
      caller.admin.finalizeUpload({
        title: "Lesson",
        originalName: "lesson.mp4",
        mimeType: "video/mp4",
        sizeBytes: 100,
        storageKey: "jewish-videos/example.mp4",
        storageUrl: "/manus-storage/jewish-videos/example.mp4",
      }),
      caller.admin.deleteVideo({ id: 1 }),
    ];

    for (const check of checks) {
      await expect(check).rejects.toMatchObject<TRPCError>({ code: "FORBIDDEN" });
    }
  });
});

describe("thumbnail metadata authorization", () => {
  const thumbnailFields = {
    thumbnailKey: "jewish-videos/thumbnails/cover.jpg",
    thumbnailUrl: "/manus-storage/jewish-videos/thumbnails/cover.jpg",
    thumbnailMimeType: "image/jpeg",
    thumbnailSizeBytes: 1024,
  };

  it("does not let a viewer finalize a video with thumbnail metadata", async () => {
    const caller = appRouter.createCaller(createContext({ viewer: { code: "123456" } }));
    await expect(caller.admin.finalizeUpload({
      title: "Lesson",
      originalName: "lesson.mp4",
      mimeType: "video/mp4",
      sizeBytes: 100,
      storageKey: "jewish-videos/videos/example.mp4",
      storageUrl: "/manus-storage/jewish-videos/videos/example.mp4",
      ...thumbnailFields,
    })).rejects.toMatchObject<TRPCError>({ code: "FORBIDDEN" });
  });

  it("rejects incomplete thumbnail metadata before insertion", async () => {
    const caller = appRouter.createCaller(createContext({ admin: true, viewer: { code: "123456" } }));
    await expect(caller.admin.finalizeUpload({
      title: "Lesson",
      originalName: "lesson.mp4",
      mimeType: "video/mp4",
      sizeBytes: 100,
      storageKey: "jewish-videos/videos/example.mp4",
      storageUrl: "/manus-storage/jewish-videos/videos/example.mp4",
      thumbnailKey: thumbnailFields.thumbnailKey,
    })).rejects.toMatchObject<TRPCError>({ code: "BAD_REQUEST" });
  });
});

describe("artist attribution", () => {
  const baseVideo = {
    title: "Lesson",
    originalName: "lesson.mp4",
    mimeType: "video/mp4",
    sizeBytes: 100,
    storageKey: "jewish-videos/videos/example.mp4",
    storageUrl: "/manus-storage/jewish-videos/videos/example.mp4",
  };

  it("keeps artist metadata behind admin authorization", async () => {
    const caller = appRouter.createCaller(createContext({ viewer: { code: "123456" } }));
    await expect(caller.admin.finalizeUpload({ ...baseVideo, artist: "Rabbi David Cohen" })).rejects.toMatchObject<TRPCError>({ code: "FORBIDDEN" });
  });

  it("rejects artist names longer than 255 characters", async () => {
    const caller = appRouter.createCaller(createContext({ admin: true, viewer: { code: "123456" } }));
    await expect(caller.admin.finalizeUpload({ ...baseVideo, artist: "A".repeat(256) })).rejects.toMatchObject<TRPCError>({ code: "BAD_REQUEST" });
  });
});

describe("existing video editing authorization", () => {
  const updateInput = {
    id: 1,
    title: "Updated lesson",
    artist: "Rabbi David Cohen",
  };

  it("does not let a viewer update existing video metadata", async () => {
    const caller = appRouter.createCaller(createContext({ viewer: { code: "123456" } }));
    await expect(caller.admin.updateVideo(updateInput)).rejects.toMatchObject<TRPCError>({ code: "FORBIDDEN" });
  });

  it("rejects incomplete replacement thumbnail metadata before database access", async () => {
    const caller = appRouter.createCaller(createContext({ admin: true, viewer: { code: "123456" } }));
    await expect(caller.admin.updateVideo({
      ...updateInput,
      thumbnailKey: "jewish-videos/thumbnails/new.jpg",
    })).rejects.toMatchObject<TRPCError>({ code: "BAD_REQUEST" });
  });
});
