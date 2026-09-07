import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({ transformer: superjson });

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sign-in required" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Administrator access required" });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
);

export const viewerProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;
    if (!ctx.viewer && !ctx.admin) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Viewer access code required" });
    }
    return next({ ctx });
  }),
);

export const codeAdminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;
    if (!ctx.viewer) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Unlock the video library before opening the admin panel." });
    }
    if (!ctx.admin) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Admin code required" });
    }
    return next({ ctx });
  }),
);
