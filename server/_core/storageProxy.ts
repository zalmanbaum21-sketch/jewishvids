import type { Express } from "express";
import { getVideoByStorageKey, hasAccessCode } from "../db";
import { readAccessSessions } from "../access";
import { storageGetSignedUrl } from "../storage";

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    if (key.startsWith("jewish-videos/")) {
      const video = await getVideoByStorageKey(key);
      if (!video) {
        res.status(404).send("Video not found");
        return;
      }
      const access = await readAccessSessions(req);
      const viewerStillValid = access.viewer ? await hasAccessCode(access.viewer.code) : false;
      if (!access.admin && !viewerStillValid) {
        res.status(403).send("Video access code required");
        return;
      }
    }

    try {
      const url = await storageGetSignedUrl(key);
      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage backend error");
    }
  });
}
