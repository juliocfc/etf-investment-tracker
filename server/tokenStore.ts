/**
 * In-memory store for Google OAuth tokens.
 * This ensures tokens are not persisted to the database as per user request.
 * Tokens will be lost when the server restarts.
 */

interface GoogleTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

const tokenStore = new Map<number, GoogleTokens>();

export function saveTokens(userId: number, accessToken: string, refreshToken?: string, expiresIn: number = 3600) {
  tokenStore.set(userId, {
    accessToken,
    refreshToken,
    expiresAt: Date.now() + (expiresIn * 1000)
  });
}

export function getTokens(userId: number): GoogleTokens | undefined {
  return tokenStore.get(userId);
}

export function clearTokens(userId: number) {
  tokenStore.delete(userId);
}
