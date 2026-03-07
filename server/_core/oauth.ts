
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { getGoogleOAuthService } from "./googleOAuth";


function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

export function registerOAuthRoutes(app: Express) {
  // Google OAuth callback
  app.get("/api/oauth/google/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    console.log("[Google OAuth] Callback endpoint hit!");
    console.log("[Google OAuth] Query params:", {
      code: code ? "present" : "missing",
      state: state ? "present" : "missing",
    });

    if (!code || !state) {
      console.error("[Google OAuth] Missing code or state");
      return res.redirect("/?error=missing_code_or_state");
    }

    try {
      // Decode state to get redirect URI
      let redirectUri: string;
      try {
        redirectUri = atob(state);
      } catch (e) {
        console.error("[Google OAuth] Failed to decode state");
        return res.redirect("/?error=invalid_state");
      }

      console.log("[Google OAuth] Exchanging code for token");
      const tokenResponse = await getGoogleOAuthService().exchangeCodeForToken(
        code,
        redirectUri
      );

      console.log("[Google OAuth] Retrieving user info");
      const userInfo = await getGoogleOAuthService().getUserInfo(
        tokenResponse.access_token
      );

      if (!userInfo.id || !userInfo.email) {
        console.error("[Google OAuth] Missing user ID or email");
        return res.redirect("/?error=missing_user_info");
      }

      // Use email as openId for consistency with existing schema
      const openId = userInfo.email;

      console.log("[Google OAuth] Upserting user to database");
      await db.upsertUser({
        openId,
        name: userInfo.name || null,
        email: userInfo.email,
        loginMethod: "google",
        lastSignedIn: new Date(),
      });

      console.log("[Google OAuth] Creating session token");
      const sessionToken = await sdk.createSessionToken(openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      console.log("[Google OAuth] Setting session cookie");
      res.cookie(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS,
      });

      console.log("[Google OAuth] Redirecting to home page");
      res.redirect(302, "/");
    } catch (error) {
      console.error("[Google OAuth] Callback failed:", error);
      res.redirect("/?error=oauth_failed");
    }
  });

  // Legacy Manus OAuth callback (kept for backward compatibility)
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    console.log("[OAuth] Callback endpoint hit!");
    console.log("[OAuth] Query params:", {
      code: code ? "present" : "missing",
      state: state ? "present" : "missing",
    });

    if (!code || !state) {
      console.error("[OAuth] Missing code or state");
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    try {
      console.log("[OAuth] Callback received with code and state");
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      console.log("[OAuth] Token exchanged successfully");
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      console.log("[OAuth] User info retrieved:", {
        openId: userInfo.openId,
        name: userInfo.name,
      });

      if (!userInfo.openId) {
        console.error("[OAuth] openId missing from user info");
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });
      console.log("[OAuth] User upserted to database");

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });
      console.log("[OAuth] Session token created");

      const cookieOptions = getSessionCookieOptions(req);
      console.log("[OAuth] Cookie options:", cookieOptions);
      res.cookie(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS,
      });
      console.log("[OAuth] Cookie set, redirecting to /");

      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}
