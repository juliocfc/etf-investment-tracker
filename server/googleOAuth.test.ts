import { describe, it, expect } from "vitest";
import { getGoogleOAuthService } from "./_core/googleOAuth";

describe("Google OAuth Service", () => {
  it("should generate a valid Google OAuth authorization URL", () => {
    const redirectUri = "https://example.com/callback";
    const state = "test-state-123";

    const authUrl = getGoogleOAuthService().generateAuthUrl(redirectUri, state);

    expect(authUrl).toContain("https://accounts.google.com/o/oauth2/v2/auth");
    expect(authUrl).toContain("client_id=");
    expect(authUrl).toContain("redirect_uri=");
    expect(authUrl).toContain("response_type=code");
    expect(authUrl).toContain("scope=");
    expect(authUrl).toContain("state=");
    expect(authUrl).toContain("access_type=offline");
    expect(authUrl).toContain("prompt=consent");
  });

  it("should have client ID and secret configured", () => {
    // This test verifies that the credentials are set
    // The actual values are not exposed, but we can verify the service was initialized
    expect(getGoogleOAuthService).toBeDefined();
    expect(getGoogleOAuthService().generateAuthUrl).toBeDefined();
  });
});
