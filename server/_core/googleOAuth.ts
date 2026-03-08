
import axios from "axios";
import { getEnv } from "./env";

export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
  id_token: string;
}

export interface GoogleUserInfo {
  id: string;
  email: string;
  name: string;
  picture?: string;
  email_verified: boolean;
}

class GoogleOAuthService {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly tokenUrl = "https://oauth2.googleapis.com/token";
  private readonly userInfoUrl = "https://www.googleapis.com/oauth2/v2/userinfo";

  constructor() {
    const env = getEnv();
    this.clientId = env.googleOAuthClientId;
    this.clientSecret = env.googleOAuthClientSecret;

    if (!this.clientId || !this.clientSecret) {
      console.error(
        "[Google OAuth] Missing credentials: GOOGLE_OAUTH_CLIENT_ID or GOOGLE_OAUTH_CLIENT_SECRET"
      );
    }
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(
    code: string,
    redirectUri: string
  ): Promise<GoogleTokenResponse> {
    try {
      const response = await axios.post<GoogleTokenResponse>(this.tokenUrl, {
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      });

      console.log("[Google OAuth] Token exchanged successfully");
      return response.data;
    } catch (error) {
      console.error("[Google OAuth] Token exchange failed:", error);
      throw new Error("Failed to exchange authorization code for token");
    }
  }

  /**
   * Get user information using access token
   */
  async getUserInfo(accessToken: string): Promise<GoogleUserInfo> {
    try {
      const response = await axios.get<GoogleUserInfo>(this.userInfoUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      console.log("[Google OAuth] User info retrieved:", {
        id: response.data.id,
        email: response.data.email,
        name: response.data.name,
      });

      return response.data;
    } catch (error) {
      console.error("[Google OAuth] Failed to get user info:", error);
      throw new Error("Failed to retrieve user information");
    }
  }

  /**
   * Generate Google OAuth authorization URL
   */
  generateAuthUrl(
    redirectUri: string,
    state: string,
    scope: string[] = ["openid", "email", "profile"]
  ): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: scope.join(" "),
      state,
      access_type: "offline",
      prompt: "consent",
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }
}

let _googleOAuthService: GoogleOAuthService | null = null;

export function getGoogleOAuthService(): GoogleOAuthService {
  if (!_googleOAuthService) {
    _googleOAuthService = new GoogleOAuthService();
  }
  return _googleOAuthService;
}

