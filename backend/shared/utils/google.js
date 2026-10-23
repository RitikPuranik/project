import { OAuth2Client } from "google-auth-library";

// Server-side Google OAuth 2.0 (authorization-code flow). Needs GOOGLE_CLIENT_ID and
// GOOGLE_CLIENT_SECRET; the redirect URI must also be registered in Google Cloud Console.
// Kept behind an object so tests can swap it out.
export const googleOAuth = {
  isConfigured: () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  redirectUri: () =>
    process.env.GOOGLE_CALLBACK_URL || `http://localhost:${process.env.PORT || 5000}/api/auth/google/callback`,
  client() {
    return new OAuth2Client(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, this.redirectUri());
  },
  authUrl(state) {
    return this.client().generateAuthUrl({ scope: ["openid", "email", "profile"], state, prompt: "select_account" });
  },
  /** Exchanges the ?code for tokens and returns the verified ID-token payload. */
  async profileFromCode(code) {
    const client = this.client();
    const { tokens } = await client.getToken(code);
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: process.env.GOOGLE_CLIENT_ID });
    return ticket.getPayload();
  },
};
