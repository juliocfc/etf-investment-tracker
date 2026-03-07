export function getEnv() {
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

// For backward compatibility
export const ENV = new Proxy({} as ReturnType<typeof getEnv>, {
  get: (target, prop) => {
    return getEnv()[prop as keyof ReturnType<typeof getEnv>];
  },
});
