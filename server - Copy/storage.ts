import { ENV } from "./_core/env";

const VCDN_BASE_URL = "https://cdn.vcdn.me";

function getVcdnApiKey() {
  if (!ENV.vcdnApiKey) throw new Error("VCDN storage is not configured. Set VCDN_API_KEY in Render.");
  return ENV.vcdnApiKey;
}

export async function vcdnGetEmbedUrl(videoId: string): Promise<string> {
  const apiKey = getVcdnApiKey();
  const response = await fetch(`${VCDN_BASE_URL}/api/v1/videos/${encodeURIComponent(videoId)}`, {
    headers: { "X-API-Key": apiKey, Accept: "application/json" },
  });
  const body = await response.json().catch(() => ({})) as { embed_url?: string; embedUrl?: string; status?: string; message?: string };
  if (!response.ok) throw new Error(body.message || `VCDN video lookup failed (${response.status})`);
  const embedUrl = body.embed_url || body.embedUrl;
  if (!embedUrl) throw new Error(body.status === "processing" ? "This video is still processing. Please try again in a moment." : "VCDN did not return a video player URL yet.");
  return embedUrl;
}

export function vcdnStorageKey(videoId: string) {
  return `vcdn/${videoId}`;
}

export function vcdnStorageUrl(videoId: string) {
  return `/manus-storage/vcdn/${videoId}`;
}

// Kept for backwards compatibility with the admin router. New video uploads use
// the browser's direct resumable VCDN uploader instead of this legacy preparation path.
export async function storagePrepareUpload(_relKey: string): Promise<{ key: string; url: string }> {
  throw new Error("Video uploads now use VCDN's direct resumable uploader.");
}
