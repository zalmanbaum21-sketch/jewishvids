export type VideoUploadResponse = { key: string; url: string };

export type UploadProgress = {
  loaded: number;
  total: number;
  elapsedMs: number;
  speedBytesPerSecond: number;
  etaSeconds: number | null;
};

type UploadResponseBody = Partial<VideoUploadResponse> & { message?: string };
type ResumableSession = { uploadId: string; chunkSize: number; totalChunks: number };
type ProgressHandler = (value: number, detail?: UploadProgress) => void;

function readJsonResponse(response: Response) {
  return response.json().catch(() => ({})) as Promise<UploadResponseBody & Partial<ResumableSession>>;
}

function createProgress(loaded: number, total: number, startedAt: number): UploadProgress {
  const elapsedMs = Math.max(1, Date.now() - startedAt);
  const speedBytesPerSecond = loaded / (elapsedMs / 1000);
  const remainingBytes = Math.max(0, total - loaded);
  return { loaded, total, elapsedMs, speedBytesPerSecond, etaSeconds: speedBytesPerSecond > 0 && remainingBytes > 0 ? remainingBytes / speedBytesPerSecond : null };
}

function wait(milliseconds: number) { return new Promise(resolve => setTimeout(resolve, milliseconds)); }

export function uploadVideoFile(file: File, onProgress: ProgressHandler, role: "video" | "thumbnail" = "video") {
  return new Promise<VideoUploadResponse>((resolve, reject) => {
    const request = new XMLHttpRequest();
    const startedAt = Date.now();
    request.open("POST", "/api/video-upload");
    request.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    request.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
    request.setRequestHeader("X-File-Type", file.type || "application/octet-stream");
    request.setRequestHeader("X-File-Size", String(file.size));
    request.setRequestHeader("X-Upload-Role", role);
    request.upload.onprogress = event => { if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100), createProgress(event.loaded, event.total, startedAt)); };
    request.onload = () => {
      let response: UploadResponseBody = {};
      try { response = JSON.parse(request.responseText) as UploadResponseBody; } catch {}
      if (request.status >= 200 && request.status < 300 && response.key && response.url) resolve({ key: response.key, url: response.url });
      else reject(new Error(response.message || `Upload failed (${request.status})`));
    };
    request.onerror = () => reject(new Error("Upload could not reach the video upload service. Please retry."));
    request.onabort = () => reject(new Error("Upload was cancelled."));
    request.send(file);
  });
}

function uploadVcdnChunk(chunk: Blob, uploadId: string, apiKey: string, totalBytes: number, completedBytes: number, startedAt: number, onProgress: ProgressHandler) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `https://cdn.vcdn.me/api/v1/upload/${encodeURIComponent(uploadId)}/chunk`);
    request.setRequestHeader("X-API-Key", apiKey);
    request.setRequestHeader("Content-Type", "application/octet-stream");
    request.upload.onprogress = event => {
      if (event.lengthComputable) {
        const loaded = Math.min(totalBytes, completedBytes + event.loaded);
        onProgress(Math.round((loaded / totalBytes) * 100), createProgress(loaded, totalBytes, startedAt));
      }
    };
    request.onload = () => request.status >= 200 && request.status < 300 ? resolve() : reject(new Error(`VCDN chunk upload failed (${request.status}).`));
    request.onerror = () => reject(new Error("VCDN could not receive this upload chunk."));
    request.onabort = () => reject(new Error("Upload was cancelled."));
    request.send(chunk);
  });
}

export async function uploadVideoFileResumable(file: File, onProgress: ProgressHandler, onStatus?: (status: "uploading" | "assembling") => void) {
  const apiKey = import.meta.env.VITE_VCDN_API_KEY as string | undefined;
  if (!apiKey) throw new Error("VCDN is not configured yet. Add VITE_VCDN_API_KEY to Render.");
  const chunkSize = 8 * 1024 * 1024;
  const totalChunks = Math.ceil(file.size / chunkSize);
  const sessionResponse = await fetch("/api/video-upload/session", {
    method: "POST",
    headers: { "X-File-Name": encodeURIComponent(file.name), "X-File-Type": file.type || "application/octet-stream", "X-File-Size": String(file.size), "X-Total-Chunks": String(totalChunks) },
  });
  const sessionBody = await readJsonResponse(sessionResponse);
  if (!sessionResponse.ok || !sessionBody.uploadId) throw new Error(sessionBody.message || "Could not start the VCDN video upload.");

  const startedAt = Date.now();
  let completedBytes = 0;
  onStatus?.("uploading");
  for (let chunkIndex = 0; chunkIndex < sessionBody.totalChunks; chunkIndex += 1) {
    const start = chunkIndex * sessionBody.chunkSize;
    const end = Math.min(file.size, start + sessionBody.chunkSize);
    const chunk = file.slice(start, end);
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await uploadVcdnChunk(chunk, sessionBody.uploadId, apiKey, file.size, completedBytes, startedAt, onProgress);
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
        if (attempt < 2) await wait(750 * (attempt + 1));
      }
    }
    if (lastError) throw lastError instanceof Error ? lastError : new Error("VCDN chunk upload failed. Please retry.");
    completedBytes = end;
    onProgress(Math.round((completedBytes / file.size) * 100), createProgress(completedBytes, file.size, startedAt));
  }

  onStatus?.("assembling");
  const completeResponse = await fetch("/api/video-upload/complete", { method: "POST", headers: { "X-Upload-Id": sessionBody.uploadId } });
  const completeBody = await readJsonResponse(completeResponse);
  if (!completeResponse.ok || !completeBody.key || !completeBody.url) throw new Error(completeBody.message || "VCDN could not finalize the upload.");
  onProgress(100, createProgress(file.size, file.size, startedAt));
  return { key: completeBody.key, url: completeBody.url };
}
