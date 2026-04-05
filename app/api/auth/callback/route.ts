import { NextRequest, NextResponse } from "next/server";

import { getAuthEnv } from "@/lib/server/auth/env";
import {
  OidcTokenExchangeError,
  OidcTokenValidationError,
  exchangeCodeForTokens,
  validateIdToken
} from "@/lib/server/auth/oidc";
import { completeValidatedIdentitySignIn } from "@/lib/server/auth/signin";
import { shouldUseSecureCookies, verifyAuthAttemptToken } from "@/lib/server/auth/session";

export const runtime = "nodejs";

type CallbackFailureReason = "auth_failed" | "state_invalid" | "token_invalid" | "disabled";

const DEFAULT_AUTH_ATTEMPT_COOKIE_NAME = "lt_auth_attempt";
const DEFAULT_APP_SESSION_COOKIE_NAME = "lt_session";

const getAuthAttemptCookieNameFromProcessEnv = (): string => {
  return process.env.APP_AUTH_ATTEMPT_COOKIE_NAME?.trim() || DEFAULT_AUTH_ATTEMPT_COOKIE_NAME;
};

const getAppSessionCookieNameFromProcessEnv = (): string => {
  return process.env.APP_SESSION_COOKIE_NAME?.trim() || DEFAULT_APP_SESSION_COOKIE_NAME;
};

const clearCookie = (response: NextResponse, input: { name: string; secure: boolean }): void => {
  response.cookies.set(input.name, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: input.secure,
    path: "/",
    maxAge: 0
  });
};

const buildLoginUrl = (appBaseUrl: string, reason?: CallbackFailureReason): URL => {
  const url = new URL("/login", appBaseUrl);
  if (reason) {
    url.searchParams.set("reason", reason);
  }

  return url;
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const fallbackCookieName = getAuthAttemptCookieNameFromProcessEnv();
  const fallbackAppCookieName = getAppSessionCookieNameFromProcessEnv();
  const fallbackSecure = request.nextUrl.protocol === "https:";

  let env;
  try {
    env = getAuthEnv();
  } catch (error) {
    const message = error instanceof Error ? error.message : "AUTH_ENV_INVALID";
    console.error("[auth.callback] auth_failed", { code: "AUTH_ENV_INVALID", detail: message });
    const response = NextResponse.redirect(buildLoginUrl(request.nextUrl.origin, "auth_failed"), { status: 302 });
    clearCookie(response, { name: fallbackCookieName, secure: fallbackSecure });
    clearCookie(response, { name: fallbackAppCookieName, secure: fallbackSecure });
    return response;
  }

  const secure = shouldUseSecureCookies(env.appBaseUrl, request.nextUrl.protocol);
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const authAttemptCookieValue = request.cookies.get(env.authAttemptCookieName)?.value;

  const fail = (
    reason: CallbackFailureReason,
    options?: { logCode?: string; clearAppSession?: boolean }
  ): NextResponse => {
    const logCode = options?.logCode;
    if (logCode) {
      console.error(`[auth.callback] ${reason}`, { code: logCode });
    }

    const response = NextResponse.redirect(buildLoginUrl(env.appBaseUrl, reason), { status: 302 });
    clearCookie(response, { name: env.authAttemptCookieName, secure });
    if (options?.clearAppSession === true) {
      clearCookie(response, { name: env.appSessionCookieName, secure });
    }
    return response;
  };

  if (!code || !state || !authAttemptCookieValue) {
    return fail("state_invalid", { logCode: "STATE_OR_CODE_MISSING" });
  }

  const authAttemptResult = verifyAuthAttemptToken(authAttemptCookieValue, env.appSessionSecret);
  if (!authAttemptResult.ok || !authAttemptResult.payload) {
    return fail("state_invalid", { logCode: authAttemptResult.reason ?? "AUTH_ATTEMPT_INVALID" });
  }

  if (authAttemptResult.payload.state !== state) {
    return fail("state_invalid", { logCode: "STATE_MISMATCH" });
  }

  let validatedIdentity: Awaited<ReturnType<typeof validateIdToken>>;
  try {
    const tokens = await exchangeCodeForTokens({
      tokenEndpoint: env.authentikTokenEndpoint,
      clientId: env.authentikClientId,
      clientSecret: env.authentikClientSecret,
      code,
      redirectUri: env.authentikRedirectUri
    });

    validatedIdentity = await validateIdToken({
      idToken: tokens.idToken,
      jwksUri: env.authentikJwksUri,
      expectedIssuer: env.authentikIssuerUrl,
      expectedAudience: env.authentikClientId,
      expectedNonce: authAttemptResult.payload.nonce
    });
  } catch (error) {
    const logCode =
      error instanceof OidcTokenExchangeError || error instanceof OidcTokenValidationError
        ? error.message
        : "TOKEN_PROCESSING_FAILED";

    return fail("token_invalid", { logCode });
  }

  const signInResult = await completeValidatedIdentitySignIn({
    env,
    validatedIdentity,
    secure,
    returnTo: authAttemptResult.payload.returnTo || "/",
    authAttemptCookieName: env.authAttemptCookieName
  });

  if (!signInResult.ok) {
    return fail(signInResult.reason, {
      logCode: signInResult.logCode,
      clearAppSession: signInResult.clearAppSession
    });
  }

  return signInResult.response;
}

