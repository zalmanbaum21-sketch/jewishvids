import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadVideoFile, uploadVideoFileResumable } from "./videoUpload";

class FakeXHR {
  static last: FakeXHR | undefined;
  status = 0;
  responseText = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  upload: { onprogress: ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null };

  constructor() {
    FakeXHR.last = this;
  }

  open() {}
  setRequestHeader() {}
  send() {}
  succeed(body: unknown) {
    this.status = 201;
    this.responseText = JSON.stringify(body);
    this.onload?.();
  }
  failNetwork() {
    this.onerror?.();
  }
}

class ResumableXHR extends FakeXHR {
  send(body: Blob) {
    queueMicrotask(() => {
      this.upload.onprogress?.({ lengthComputable: true, loaded: body.size, total: body.size });
      this.status = 201;
      this.responseText = "{}";
      this.onload?.();
    });
  }
}

class FailingResumableXHR extends FakeXHR {
  send() {
    queueMicrotask(() => this.failNetwork());
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeXHR.last = undefined;
});

describe("uploadVideoFile", () => {
  it("resolves storage metadata and reports progress on success", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXHR);
    const progress: number[] = [];
    const details: Array<{ loaded: number; total: number; elapsedMs: number; speedBytesPerSecond: number; etaSeconds: number | null }> = [];
    const promise = uploadVideoFile({ name: "lesson.mp4", type: "video/mp4", size: 113 * 1024 * 1024 } as File, (value, detail) => { progress.push(value); if (detail) details.push(detail); });
    FakeXHR.last?.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 });
    FakeXHR.last?.succeed({ key: "jewish-videos/lesson.mp4", url: "/manus-storage/jewish-videos/lesson.mp4" });
    await expect(promise).resolves.toEqual({ key: "jewish-videos/lesson.mp4", url: "/manus-storage/jewish-videos/lesson.mp4" });
    expect(progress).toEqual([50]);
    expect(details[0]).toMatchObject({ loaded: 50, total: 100 });
    expect(details[0]?.speedBytesPerSecond).toBeGreaterThan(0);
  });

  it("returns an actionable retry message on network failure", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXHR);
    const promise = uploadVideoFile({ name: "lesson.mp4", type: "video/mp4", size: 113 * 1024 * 1024 } as File, () => {});
    FakeXHR.last?.failNetwork();
    await expect(promise).rejects.toThrow("Upload could not reach the video upload service. Please retry.");
  });

  it("surfaces the session failure message when resumable upload setup fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ message: "Upload session could not be created." }) });
    vi.stubGlobal("fetch", fetchMock);
    const file = { name: "lesson.mp4", type: "video/mp4", size: 1, slice: () => new Blob([new Uint8Array(1)]) } as unknown as File;
    await expect(uploadVideoFileResumable(file, () => {})).rejects.toThrow("Upload session could not be created.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces the chunk failure message after resumable retries are exhausted", async () => {
    vi.stubGlobal("XMLHttpRequest", FailingResumableXHR);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ uploadId: "upload-2", chunkSize: 16, totalChunks: 1 }) });
    vi.stubGlobal("fetch", fetchMock);
    const file = { name: "lesson.mp4", type: "video/mp4", size: 1, slice: () => new Blob([new Uint8Array(1)]) } as unknown as File;
    await expect(uploadVideoFileResumable(file, () => {})).rejects.toThrow("Chunk upload could not reach the video upload service.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uploads a video in resumable chunks and completes the storage object", async () => {
    vi.stubGlobal("XMLHttpRequest", ResumableXHR);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ uploadId: "upload-1", chunkSize: 16, totalChunks: 2 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ key: "jewish-videos/videos/final.mp4", url: "/manus-storage/jewish-videos/videos/final.mp4" }) });
    vi.stubGlobal("fetch", fetchMock);
    const file = { name: "lesson.mp4", type: "video/mp4", size: 16 * 1024 * 1024 + 32, slice: (start: number, end: number) => new Blob([new Uint8Array(end - start)]) } as unknown as File;
    const result = await uploadVideoFileResumable(file, () => {});
    expect(result).toEqual({ key: "jewish-videos/videos/final.mp4", url: "/manus-storage/jewish-videos/videos/final.mp4" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ headers: expect.objectContaining({ "X-Total-Chunks": "2" }) });
  });
});
