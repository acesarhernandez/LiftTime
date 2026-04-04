import { NextRequest, NextResponse } from "next/server";

import { getAuthEnv } from "@/lib/server/auth/env";
import {
  OidcTokenExchangeError,
  OidcTokenValidationError,
  exchangeCodeForTokens,
  validateIdToken
} from "@/lib/server/auth/oidc";
import { shouldUseSecureCookies, verifyAuthAttemptToken } from "@/lib/server/auth/session";

export const runtime = "nodejs";

type CallbackFailureReason = "auth_failed" | "state_invalid" | "token_invalid" | "disabled";

const DEFAULT_AUTH_ATTEMPT_COOKIE_NAME = "lt_auth_attempt";

const getAuthAttemptCookieNameFromProcessEnv = (): string => {
  return process.env.APP_AUTH_ATTEMPT_COOKIE_NAME?.trim() || DEFAULT_AUTH_ATTEMPT_COOKIE_NAME;
};

const clearAuthAttemptCookie = (
  response: NextResponse,
  cookieName: string,
  secure: boolean
): NextResponse => {
  response.cookies.set(cookieName, "", {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 0
  });

  return response;
};

const buildLoginUrl = (appBaseUrl: string, reason?: CallbackFailureReason): URL => {
  const url = new URL("/login", appBaseUrl);
  if (reason) {
    url.searchParams.set("reason", reason);
  }

  return url;
};

const buildPlaceholderSuccessUrl = (appBaseUrl: string): URL => {
  const url = new URL("/login", appBaseUrl);
  url.searchParams.set("callback", "verified");
  return url;
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const fallbackCookieName = getAuthAttemptCookieNameFromProcessEnv();
  const fallbackSecure = request.nextUrl.protocol === "https:";

  let env;
  try {
    env = getAuthEnv();
  } catch (error) {
    const message = error instanceof Error ? error.message : "AUTH_ENV_INVALID";
    console.error("[auth.callback] auth_failed", { code: "AUTH_ENV_INVALID", detail: message });
    const response = NextResponse.redirect(buildLoginUrl(request.nextUrl.origin, "auth_failed"), { status: 302 });
    return clearAuthAttemptCookie(response, fallbackCookieName, fallbackSecure);
  }

  const secure = shouldUseSecureCookies(env.appBaseUrl, request.nextUrl.protocol);
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const authAttemptCookieValue = request.cookies.get(env.authAttemptCookieName)?.value;

  if (!code || !state || !authAttemptCookieValue) {
    const response = NextResponse.redirect(buildLoginUrl(env.appBaseUrl, "state_invalid"), { status: 302 });
    return clearAuthAttemptCookie(response, env.authAttemptCookieName, secure);
  }

  const authAttemptResult = verifyAuthAttemptToken(authAttemptCookieValue, env.appSessionSecret);
  if (!authAttemptResult.ok || !authAttemptResult.payload) {
    console.error("[auth.callback] state_invalid", { code: authAttemptResult.reason ?? "AUTH_ATTEMPT_INVALID" });
    const response = NextResponse.redirect(buildLoginUrl(env.appBaseUrl, "state_invalid"), { status: 302 });
    return clearAuthAttemptCookie(response, env.authAttemptCookieName, secure);
  }

  if (authAttemptResult.payload.state !== state) {
    console.error("[auth.callback] state_invalid", { code: "STATE_MISMATCH" });
    const response = NextResponse.redirect(buildLoginUrl(env.appBaseUrl, "state_invalid"), { status: 302 });
    return clearAuthAttemptCookie(response, env.authAttemptCookieName, secure);
  }

  try {
    const tokens = await exchangeCodeForTokens({
      tokenEndpoint: env.authentikTokenEndpoint,
      clientId: env.authentikClientId,
      clientSecret: env.authentikClientSecret,
      code,
      redirectUri: env.authentikRedirectUri
    });

    await validateIdToken({
      idToken: tokens.idToken,
      jwksUri: env.authentikJwksUri,
      expectedIssuer: env.authentikIssuerUrl,
      expectedAudience: env.authentikClientId,
      expectedNonce: authAttemptResult.payload.nonce
    });
  } catch (error) {
    const code =
      error instanceof OidcTokenExchangeError || error instanceof OidcTokenValidationError
        ? error.message
        : "TOKEN_PROCESSING_FAILED";

    console.error("[auth.callback] token_invalid", { code });

    const response = NextResponse.redirect(buildLoginUrl(env.appBaseUrl, "token_invalid"), { status: 302 });
    return clearAuthAttemptCookie(response, env.authAttemptCookieName, secure);
  }

  const response = NextResponse.redirect(buildPlaceholderSuccessUrl(env.appBaseUrl), { status: 302 });
  return clearAuthAttemptCookie(response, env.authAttemptCookieName, secure);
}

