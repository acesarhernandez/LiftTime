import { NextRequest, NextResponse } from "next/server";

import { getAuthEnv } from "@/lib/server/auth/env";
import {
  OidcTokenExchangeError,
  OidcTokenValidationError,
  exchangeCodeForTokens,
  validateIdToken
} from "@/lib/server/auth/oidc";
import {
  MappingIntegrityConflictError,
  PrincipalWiringError,
  createSyntheticTechnicalEmail,
  normalizeMaybeEmail,
  resolveOrCreateTechnicalPrincipal
} from "@/lib/server/auth/principal";
import {
  buildAppSessionCookie,
  createAppSessionPayload,
  resolveSafeReturnTo,
  shouldUseSecureCookies,
  verifyAuthAttemptToken
} from "@/lib/server/auth/session";

export const runtime = "nodejs";

type CallbackFailureReason = "auth_failed" | "state_invalid" | "token_invalid" | "disabled";

const DEFAULT_AUTH_ATTEMPT_COOKIE_NAME = "lt_auth_attempt";
const DEFAULT_APP_SESSION_COOKIE_NAME = "lt_session";

interface UsersProfileRow {
  id: string;
  email: string;
  is_disabled: boolean;
}

interface SupabaseErrorResponse {
  code?: string;
  message?: string;
  msg?: string;
  error?: string;
}

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

const buildSuccessUrl = (appBaseUrl: string, returnTo: string): URL => {
  const safeReturnTo = resolveSafeReturnTo(returnTo);
  return new URL(safeReturnTo, appBaseUrl);
};

const createServiceHeaders = (serviceRoleKey: string, includeJson = true): HeadersInit => {
  const headers: Record<string, string> = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`
  };

  if (includeJson) {
    headers["Content-Type"] = "application/json";
  }

  return headers;
};

const parseSupabaseError = async (response: Response): Promise<SupabaseErrorResponse | null> => {
  try {
    return (await response.json()) as SupabaseErrorResponse;
  } catch {
    return null;
  }
};

const fetchUsersProfile = async (
  input: {
    supabaseUrl: string;
    serviceRoleKey: string;
    authUserId: string;
  }
): Promise<UsersProfileRow | null> => {
  const query = new URLSearchParams({
    select: "id,email,is_disabled",
    id: `eq.${input.authUserId}`,
    limit: "1"
  });

  const response = await fetch(`${input.supabaseUrl}/rest/v1/users_profile?${query.toString()}`, {
    method: "GET",
    headers: createServiceHeaders(input.serviceRoleKey, false),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("PROFILE_LOOKUP_FAILED");
  }

  const rows = (await response.json()) as UsersProfileRow[];
  return rows[0] ?? null;
};

const updateUsersProfileEmail = async (
  input: {
    supabaseUrl: string;
    serviceRoleKey: string;
    authUserId: string;
    email: string;
  }
): Promise<void> => {
  const query = new URLSearchParams({
    id: `eq.${input.authUserId}`
  });

  const response = await fetch(`${input.supabaseUrl}/rest/v1/users_profile?${query.toString()}`, {
    method: "PATCH",
    headers: createServiceHeaders(input.serviceRoleKey),
    body: JSON.stringify({
      email: input.email
    }),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("PROFILE_EMAIL_REPAIR_FAILED");
  }
};

const insertUsersProfile = async (
  input: {
    supabaseUrl: string;
    serviceRoleKey: string;
    authUserId: string;
    bootstrapEmail: string;
  }
): Promise<UsersProfileRow | null> => {
  const response = await fetch(`${input.supabaseUrl}/rest/v1/users_profile`, {
    method: "POST",
    headers: {
      ...createServiceHeaders(input.serviceRoleKey),
      Prefer: "return=representation"
    },
    body: JSON.stringify({
      id: input.authUserId,
      email: input.bootstrapEmail
    }),
    cache: "no-store"
  });

  if (response.ok) {
    const rows = (await response.json()) as UsersProfileRow[];
    return rows[0] ?? null;
  }

  const maybeError = await parseSupabaseError(response);
  if (response.status === 409 || maybeError?.code === "23505") {
    return null;
  }

  throw new Error("PROFILE_INSERT_FAILED");
};

const ensureUsersProfile = async (
  input: {
    supabaseUrl: string;
    serviceRoleKey: string;
    authUserId: string;
    bootstrapEmail: string;
  }
): Promise<UsersProfileRow> => {
  const existing = await fetchUsersProfile(input);
  if (existing) {
    if (!existing.email || existing.email.trim().length === 0) {
      await updateUsersProfileEmail({
        supabaseUrl: input.supabaseUrl,
        serviceRoleKey: input.serviceRoleKey,
        authUserId: input.authUserId,
        email: input.bootstrapEmail
      });

      return {
        ...existing,
        email: input.bootstrapEmail
      };
    }

    return existing;
  }

  const inserted = await insertUsersProfile(input);
  if (inserted) {
    return inserted;
  }

  const raced = await fetchUsersProfile(input);
  if (raced) {
    if (!raced.email || raced.email.trim().length === 0) {
      await updateUsersProfileEmail({
        supabaseUrl: input.supabaseUrl,
        serviceRoleKey: input.serviceRoleKey,
        authUserId: input.authUserId,
        email: input.bootstrapEmail
      });

      return {
        ...raced,
        email: input.bootstrapEmail
      };
    }

    return raced;
  }

  throw new Error("PROFILE_BOOTSTRAP_FAILED");
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
    const code =
      error instanceof OidcTokenExchangeError || error instanceof OidcTokenValidationError
        ? error.message
        : "TOKEN_PROCESSING_FAILED";

    return fail("token_invalid", { logCode: code });
  }

  let authUserId: string;
  const fallbackTechnicalEmail = createSyntheticTechnicalEmail({
    issuer: validatedIdentity.issuer,
    subject: validatedIdentity.subject
  });
  const bootstrapEmail = normalizeMaybeEmail(validatedIdentity.email) ?? fallbackTechnicalEmail;

  try {
    const principalResult = await resolveOrCreateTechnicalPrincipal({
      supabaseUrl: env.supabaseUrl,
      supabaseServiceRoleKey: env.supabaseServiceRoleKey,
      identity: {
        issuer: validatedIdentity.issuer,
        subject: validatedIdentity.subject
      },
      providerEmail: validatedIdentity.email
    });

    if (principalResult.outcome === "mapping_integrity_conflict") {
      return fail("auth_failed", { logCode: "MAPPING_INTEGRITY_CONFLICT" });
    }

    if (
      principalResult.outcome === "resolved_from_race_winner" &&
      principalResult.attemptedOrphanCleanup &&
      principalResult.orphanCleanupSucceeded === false
    ) {
      console.error("[auth.callback] auth_failed", { code: "ORPHAN_CLEANUP_FAILED" });
    }

    authUserId = principalResult.authUserId;
  } catch (error) {
    if (error instanceof MappingIntegrityConflictError) {
      return fail("auth_failed", { logCode: "MAPPING_INTEGRITY_CONFLICT" });
    }

    if (error instanceof PrincipalWiringError) {
      return fail("auth_failed", { logCode: error.code });
    }

    return fail("auth_failed", { logCode: "PRINCIPAL_RESOLUTION_FAILED" });
  }

  let profile: UsersProfileRow;
  try {
    profile = await ensureUsersProfile({
      supabaseUrl: env.supabaseUrl,
      serviceRoleKey: env.supabaseServiceRoleKey,
      authUserId,
      bootstrapEmail
    });
  } catch {
    return fail("auth_failed", { logCode: "PROFILE_BOOTSTRAP_FAILED" });
  }

  if (profile.is_disabled) {
    return fail("disabled", { logCode: "USER_DISABLED", clearAppSession: true });
  }

  try {
    const appSessionPayload = createAppSessionPayload({
      subject: authUserId,
      ttlSeconds: env.appSessionTtlSeconds
    });
    const appSessionCookie = buildAppSessionCookie({
      cookieName: env.appSessionCookieName,
      payload: appSessionPayload,
      secret: env.appSessionSecret,
      secure,
      maxAgeSeconds: env.appSessionTtlSeconds
    });

    const successUrl = buildSuccessUrl(env.appBaseUrl, authAttemptResult.payload.returnTo || "/");
    const response = NextResponse.redirect(successUrl, { status: 302 });
    response.cookies.set(appSessionCookie.name, appSessionCookie.value, appSessionCookie.options);
    clearCookie(response, { name: env.authAttemptCookieName, secure });
    return response;
  } catch {
    return fail("auth_failed", { logCode: "SESSION_ISSUE_FAILED" });
  }
}
