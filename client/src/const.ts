export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Generate Google OAuth login URL at runtime
export const getGoogleLoginUrl = () => {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || "788032713656-hh2e82tq5ga1f03chfeullhddg6c79ds.apps.googleusercontent.com";
  const redirectUri = `${window.location.origin}/api/oauth/google/callback`;
  const state = btoa(redirectUri);

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");

  console.log("[Google Login] Generated login URL:", {
    clientId,
    redirectUri,
    state: state.substring(0, 20) + "...",
  });

  return url.toString();
};
