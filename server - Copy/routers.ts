import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { codeAdminProcedure, publicProcedure, router, viewerProcedure } from "./_core/trpc";
import {
  ADMIN_CODE,
  clearAdminCookie,
  clearViewerCookie,
  createAdminSession,
  createViewerSession,
  isValidVideoUpload,
  isValidViewerCode,
  setAdminCookie,
  setViewerCookie,
  MAX_THUMBNAIL_BYTES,
  MAX_VIDEO_BYTES,
  isValidThumbnailUpload,
} from "./access";
import {
  createAccessCode,
  createVideo,
  deleteAccessCode,
  deleteVideo,
  getVideoById,
  hasAccessCode,
  listAccessCodes,
  listVideos,
  updateVideoMetadata,
} from "./db";
import { storagePrepareUpload } from "./storage";

const videoMetadataInput = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.string().startsWith("video/"),
  sizeBytes: z.number().int().positive().max(MAX_VIDEO_BYTES),
});

const accessCodeInput = z.object({ code: z.string().regex(/^\d{6}$/, "Code must contain exactly six digits") });

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  access: router({
    verifyViewer: publicProcedure.input(accessCodeInput).mutation(async ({ ctx, input }) => {
      if (!isValidViewerCode(input.code) || !(await hasAccessCode(input.code))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "That access code is not valid." });
      }
      const token = await createViewerSession(input.code);
      setViewerCookie(ctx.req, ctx.res, token);
      return { success: true } as const;
    }),
    verifyAdmin: publicProcedure.input(z.object({ code: z.string() })).mutation(({ ctx, input }) => {
      if (!ctx.viewer) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Unlock the video library before opening the admin panel." });
      }
      if (input.code !== ADMIN_CODE) {
        throw new TRPCError({ code: "FORBIDDEN", message: "That admin code is not valid." });
      }
      return createAdminSession().then(token => {
        setAdminCookie(ctx.req, ctx.res, token);
        return { success: true } as const;
      });
    }),
    logoutViewer: publicProcedure.mutation(({ ctx }) => {
      clearViewerCookie(ctx.req, ctx.res);
      return { success: true } as const;
    }),
    logoutAdmin: publicProcedure.mutation(({ ctx }) => {
      clearAdminCookie(ctx.req, ctx.res);
      return { success: true } as const;
    }),
    status: publicProcedure.query(({ ctx }) => ({
      viewer: Boolean(ctx.viewer),
      admin: ctx.admin,
    })),
  }),

  library: router({
    list: viewerProcedure.query(async ({ ctx }) => {
      if (!ctx.admin && (!ctx.viewer || !(await hasAccessCode(ctx.viewer.code)))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Viewer access code required." });
      }
      return listVideos();
    }),
  }),

  admin: router({
    listVideos: codeAdminProcedure.query(() => listVideos()),
    listAccessCodes: codeAdminProcedure.query(() => listAccessCodes()),
    addAccessCode: codeAdminProcedure.input(accessCodeInput).mutation(async ({ input }) => {
      if (!isValidViewerCode(input.code)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Code must contain exactly six digits." });
      }
      await createAccessCode(input.code);
      return { success: true } as const;
    }),
    deleteAccessCode: codeAdminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
      await deleteAccessCode(input.id);
      return { success: true } as const;
    }),
    prepareUpload: codeAdminProcedure.input(videoMetadataInput).mutation(async ({ input }) => {
      if (!isValidVideoUpload(input)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a video file no larger than 3 GB." });
      }
      const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
      const upload = await storagePrepareUpload(`jewish-videos/${Date.now()}-${safeName}`);
      return upload;
    }),
    finalizeUpload: codeAdminProcedure
      .input(
        z.object({
          title: z.string().trim().min(1).max(255),
          artist: z.string().trim().max(255).optional(),
          originalName: z.string().min(1).max(255),
          mimeType: z.string().startsWith("video/"),
          sizeBytes: z.number().int().positive().max(MAX_VIDEO_BYTES),
          storageKey: z.string().startsWith("jewish-videos/"),
          storageUrl: z.string().startsWith("/manus-storage/vcdn/"),
          thumbnailKey: z.string().startsWith("cloudinary/").optional(),
          thumbnailUrl: z.string().startsWith("https://res.cloudinary.com/").optional(),
          thumbnailMimeType: z.string().startsWith("image/").optional(),
          thumbnailSizeBytes: z.number().int().positive().max(MAX_THUMBNAIL_BYTES).optional(),
        }),
      )
      .mutation(async ({ input }) => {
        if (!isValidVideoUpload({ fileName: input.originalName, mimeType: input.mimeType, sizeBytes: input.sizeBytes })) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Video metadata is not valid." });
        }
        const thumbnailFields = [input.thumbnailKey, input.thumbnailUrl, input.thumbnailMimeType, input.thumbnailSizeBytes];
        const hasSomeThumbnailFields = thumbnailFields.some(Boolean);
        const hasAllThumbnailFields = thumbnailFields.every(Boolean);
        if (hasSomeThumbnailFields && (!hasAllThumbnailFields || !isValidThumbnailUpload({ fileName: "thumbnail", mimeType: input.thumbnailMimeType ?? "", sizeBytes: input.thumbnailSizeBytes ?? 0 }))) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Thumbnail metadata is not valid." });
        }
        await createVideo(input);
        return { success: true } as const;
      }),
    updateVideo: codeAdminProcedure.input(z.object({
      id: z.number().int().positive(),
      title: z.string().trim().min(1).max(255),
      artist: z.string().trim().max(255).optional(),
      clearThumbnail: z.boolean().optional(),
      thumbnailKey: z.string().startsWith("cloudinary/").optional(),
      thumbnailUrl: z.string().startsWith("https://res.cloudinary.com/").optional(),
      thumbnailMimeType: z.string().startsWith("image/").optional(),
      thumbnailSizeBytes: z.number().int().positive().max(MAX_THUMBNAIL_BYTES).optional(),
    })).mutation(async ({ input }) => {
      if (input.clearThumbnail && (input.thumbnailKey || input.thumbnailUrl || input.thumbnailMimeType || input.thumbnailSizeBytes)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Choose either a new thumbnail or clear the existing thumbnail." });
      }
      const thumbnailFields = [input.thumbnailKey, input.thumbnailUrl, input.thumbnailMimeType, input.thumbnailSizeBytes];
      const hasSomeThumbnailFields = thumbnailFields.some(Boolean);
      const hasAllThumbnailFields = thumbnailFields.every(Boolean);
      if (hasSomeThumbnailFields && (!hasAllThumbnailFields || !isValidThumbnailUpload({ fileName: "thumbnail", mimeType: input.thumbnailMimeType ?? "", sizeBytes: input.thumbnailSizeBytes ?? 0 }))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Thumbnail metadata is not valid." });
      }
      const video = await getVideoById(input.id);
      if (!video) throw new TRPCError({ code: "NOT_FOUND", message: "Video not found." });
      await updateVideoMetadata(input.id, {
        title: input.title.trim(),
        artist: input.artist?.trim() || null,
        thumbnailKey: input.clearThumbnail ? null : input.thumbnailKey ?? video.thumbnailKey,
        thumbnailUrl: input.clearThumbnail ? null : input.thumbnailUrl ?? video.thumbnailUrl,
        thumbnailMimeType: input.clearThumbnail ? null : input.thumbnailMimeType ?? video.thumbnailMimeType,
        thumbnailSizeBytes: input.clearThumbnail ? null : input.thumbnailSizeBytes ?? video.thumbnailSizeBytes,
      });
      return { success: true } as const;
    }),
    deleteVideo: codeAdminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
      const video = await getVideoById(input.id);
      if (!video) throw new TRPCError({ code: "NOT_FOUND", message: "Video not found." });
      await deleteVideo(input.id);
      return { success: true } as const;
    }),
  }),
});

export type AppRouter = typeof appRouter;
