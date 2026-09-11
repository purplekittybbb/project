/**
 * Login with Amazon (LWA) token exchange — SP-API Step 1.
 *
 * Official: https://developer-docs.amazon.com/sp-api/docs/connecting-to-the-selling-partner-api
 * POST https://api.amazon.com/auth/o2/token
 *   grant_type=authorization_code | refresh_token
 *
 * Pure HTTP wrapper. Tests stub fetch. Does not call SP-API order endpoints.
 */

import { LWA_TOKEN_URL } from "./constants";

export class AmazonLwaError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "AmazonLwaError";
    this.status = status;
  }
}

export interface LwaTokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  tokenType: string;
}

async function postToken(body: URLSearchParams): Promise<LwaTokenResponse> {
  const res = await fetch(LWA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: body.toString(),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new AmazonLwaError(
      `LWA token exchange failed (${res.status}).`,
      res.status,
    );
  }
  let json: {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
  };
  try {
    json = JSON.parse(text) as typeof json;
  } catch {
    throw new AmazonLwaError("LWA returned a non-JSON body.");
  }
  if (!json.access_token) {
    throw new AmazonLwaError("LWA response missing access_token.");
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresIn: json.expires_in ?? 3600,
    tokenType: json.token_type ?? "bearer",
  };
}

/** Exchange spapi_oauth_code for tokens. Code expires in 5 minutes. */
export async function exchangeAuthorizationCode(opts: {
  code: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
}): Promise<LwaTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: opts.code,
    redirect_uri: opts.redirectUri,
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
  });
  return postToken(body);
}

/** Runtime: refresh_token → short-lived access_token (typically 3600s). */
export async function exchangeRefreshToken(opts: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}): Promise<LwaTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: opts.refreshToken,
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
  });
  return postToken(body);
}
