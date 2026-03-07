export function getENV() {
  return {
    appId: process.env.VITE_APP_ID ?? "",
    cookieSecret: process.env.JWT_SECRET ?? "",
    databaseUrl: process.env.DATABASE_URL ?? "",
    oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
    ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
    isProduction: process.env.NODE_ENV === "production",
    forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
    forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
    googleOAuthClientId: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
    googleOAuthClientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
  };
}

// Create a lazy-loaded singleton
let cachedENV: ReturnType<typeof getENV> | null = null;

export function getEnv() {
  if (!cachedENV) {
    cachedENV = getENV();
  }
  return cachedENV;
}

// Keep this for backward compatibility, but it will be evaluated after dotenv loads
export const ENV = getENV();
