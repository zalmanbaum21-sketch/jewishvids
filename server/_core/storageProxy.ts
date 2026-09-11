import type { Express } from "express";
import { getVideoByStorageKey, hasAccessCode } from "../db";
import { readAccessSessions } from "../access";
import { vcdnGetEmbedUrl } from "../storage";

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) return res.status(400).send("Missing storage key");

    if (key.startsWith("vcdn/")) {
      const video = await getVideoByStorageKey(key);
      if (!video) return res.status(404).send("Video not found");
      const access = await readAccessSessions(req);
      const viewerStillValid = access.viewer ? await hasAccessCode(access.viewer.code) : false;
      if (!access.admin && !viewerStillValid) return res.status(403).send("Video access code required");

      try {
        const embedUrl = await vcdnGetEmbedUrl(key.slice("vcdn/".length));
        res.set("Cache-Control", "no-store");
        return res.redirect(307, embedUrl);
      } catch (err) {
        console.error("[StorageProxy] VCDN lookup failed:", err);
        return res.status(502).send(err instanceof Error ? err.message : "Video storage backend error");
      }
    }

    return res.status(404).send("Storage object not found");
  });
}
