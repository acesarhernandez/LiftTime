import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

interface ExchangeCodeInput {
  tokenEndpoint: string;
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}

interface VerifyIdTokenInput {
  idToken: string;
  jwksUri: string;
  expectedIssuer: string;
  expectedAudience: string;
  expectedNonce: string;
}

interface TokenEndpointResponse {
  id_token?: string;
}

export interface ValidatedIdTokenClaims {
  issuer: string;
  subject: string;
  nonce: string;
  email: string | null;
  audience: string[];
  expiresAt: number;
}

export class OidcTokenExchangeError extends Error {}
export class OidcTokenValidationError extends Error {}

const normalizePath = (pathname: string): string => {
  if (pathname === "/") {
    return "/";
  }

  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed || "/";
};

export const canonicalizeIssuer = (issuer: string): string => {
  const url = new URL(issuer);
  const normalizedPath = normalizePath(url.pathname);
  return `${url.protocol}//${url.host}${normalizedPath}`;
};

const getAudienceAsArray = (aud: JWTPayload["aud"]): string[] => {
  if (typeof aud === "string") {
    return [aud];
  }

  if (Array.isArray(aud)) {
    return aud.filter((value): value is string => typeof value === "string");
  }

  return [];
};

export const exchangeCodeForTokens = async (input: ExchangeCodeInput): Promise<{ idToken: string }> => {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    client_id: input.clientId,
    client_secret: input.clientSecret,
    redirect_uri: input.redirectUri
  });

  const response = await fetch(input.tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: body.toString(),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new OidcTokenExchangeError("TOKEN_EXCHANGE_FAILED");
  }

  let tokenResponse: TokenEndpointResponse;
  try {
    tokenResponse = (await response.json()) as TokenEndpointResponse;
  } catch {
    throw new OidcTokenExchangeError("TOKEN_RESPONSE_INVALID");
  }

  if (!tokenResponse.id_token || typeof tokenResponse.id_token !== "string") {
    throw new OidcTokenExchangeError("TOKEN_RESPONSE_MISSING_ID_TOKEN");
  }

  return {
    idToken: tokenResponse.id_token
  };
};

export const validateIdToken = async (input: VerifyIdTokenInput): Promise<ValidatedIdTokenClaims> => {
  const jwks = createRemoteJWKSet(new URL(input.jwksUri));
  const { payload } = await jwtVerify(input.idToken, jwks, {
    audience: input.expectedAudience
  });

  if (typeof payload.iss !== "string" || payload.iss.length === 0) {
    throw new OidcTokenValidationError("TOKEN_INVALID_ISSUER");
  }

  if (canonicalizeIssuer(payload.iss) !== canonicalizeIssuer(input.expectedIssuer)) {
    throw new OidcTokenValidationError("TOKEN_INVALID_ISSUER");
  }

  if (typeof payload.nonce !== "string" || payload.nonce !== input.expectedNonce) {
    throw new OidcTokenValidationError("TOKEN_INVALID_NONCE");
  }

  if (typeof payload.sub !== "string" || payload.sub.trim().length === 0) {
    throw new OidcTokenValidationError("TOKEN_INVALID_SUB");
  }

  if (typeof payload.exp !== "number") {
    throw new OidcTokenValidationError("TOKEN_INVALID_EXP");
  }

  const audience = getAudienceAsArray(payload.aud);
  if (audience.length === 0) {
    throw new OidcTokenValidationError("TOKEN_INVALID_AUDIENCE");
  }

  return {
    issuer: canonicalizeIssuer(payload.iss),
    subject: payload.sub.trim(),
    nonce: payload.nonce,
    email: typeof payload.email === "string" && payload.email.trim().length > 0 ? payload.email.trim() : null,
    audience,
    expiresAt: payload.exp
  };
};

