import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  // Log cookie information for debugging
  const cookies = opts.req.headers.cookie || "no cookies";
  console.log("[Context] Request cookies:", cookies);
  console.log("[Context] Request URL:", opts.req.url);
  console.log("[Context] Request protocol:", opts.req.protocol);
  console.log("[Context] Request headers host:", opts.req.headers.host);

  try {
    user = await sdk.authenticateRequest(opts.req);
    if (user) {
      console.log("[Context] User authenticated:", user.openId);
    } else {
      console.log("[Context] User is null");
    }
  } catch (error) {
    // Authentication is optional for public procedures.
    console.log("[Context] Authentication error:", String(error));
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
