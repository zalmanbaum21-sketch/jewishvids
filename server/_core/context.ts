import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { readAccessSessions } from "../access";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  viewer: { code: string } | null;
  admin: boolean;
};

export async function createContext(
  opts: CreateExpressContextOptions,
): Promise<TrpcContext> {
  let user: User | null = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch {
    user = null;
  }

  const access = await readAccessSessions(opts.req);
  return {
    user,
    viewer: access.viewer,
    admin: access.admin,
    req: opts.req,
    res: opts.res,
  };
}
