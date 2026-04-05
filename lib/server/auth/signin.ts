import { NextResponse } from "next/server";

import type { AuthEnv } from "@/lib/server/auth/env";
import type { ValidatedIdTokenClaims } from "@/lib/server/auth/oidc";
import {
  MappingIntegrityConflictError,
  PrincipalWiringError,
  createSyntheticTechnicalEmail,
  normalizeMaybeEmail,
  resolveOrCreateTechnicalPrincipal
} from "@/lib/server/auth/principal";
import { buildAppSessionCookie, createAppSessionPayload, resolveSafeReturnTo } from "@/lib/server/auth/session";

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

export interface CompleteValidatedIdentitySignInInput {
  env: AuthEnv;
  validatedIdentity: ValidatedIdTokenClaims;
  secure: boolean;
  returnTo: string;
  authAttemptCookieName: string;
}

export interface CompleteValidatedIdentitySignInSuccess {
  ok: true;
  response: NextResponse;
}

export interface CompleteValidatedIdentitySignInFailure {
  ok: false;
  reason: "auth_failed" | "disabled";
  logCode: string;
  clearAppSession: boolean;
}

export type CompleteValidatedIdentitySignInResult =
  | CompleteValidatedIdentitySignInSuccess
  | CompleteValidatedIdentitySignInFailure;

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

const clearCookie = (response: NextResponse, input: { name: string; secure: boolean }): void => {
  response.cookies.set(input.name, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: input.secure,
    path: "/",
    maxAge: 0
  });
};

const buildSuccessUrl = (appBaseUrl: string, returnTo: string): URL => {
  const safeReturnTo = resolveSafeReturnTo(returnTo);
  return new URL(safeReturnTo, appBaseUrl);
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

export const completeValidatedIdentitySignIn = async (
  input: CompleteValidatedIdentitySignInInput
): Promise<CompleteValidatedIdentitySignInResult> => {
  let authUserId: string;
  const fallbackTechnicalEmail = createSyntheticTechnicalEmail({
    issuer: input.validatedIdentity.issuer,
    subject: input.validatedIdentity.subject
  });
  const bootstrapEmail = normalizeMaybeEmail(input.validatedIdentity.email) ?? fallbackTechnicalEmail;

  try {
    const principalResult = await resolveOrCreateTechnicalPrincipal({
      supabaseUrl: input.env.supabaseUrl,
      supabaseServiceRoleKey: input.env.supabaseServiceRoleKey,
      identity: {
        issuer: input.validatedIdentity.issuer,
        subject: input.validatedIdentity.subject
      },
      providerEmail: input.validatedIdentity.email
    });

    if (principalResult.outcome === "mapping_integrity_conflict") {
      return {
        ok: false,
        reason: "auth_failed",
        logCode: "MAPPING_INTEGRITY_CONFLICT",
        clearAppSession: false
      };
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
      return {
        ok: false,
        reason: "auth_failed",
        logCode: "MAPPING_INTEGRITY_CONFLICT",
        clearAppSession: false
      };
    }

    if (error instanceof PrincipalWiringError) {
      return {
        ok: false,
        reason: "auth_failed",
        logCode: error.code,
        clearAppSession: false
      };
    }

    return {
      ok: false,
      reason: "auth_failed",
      logCode: "PRINCIPAL_RESOLUTION_FAILED",
      clearAppSession: false
    };
  }

  let profile: UsersProfileRow;
  try {
    profile = await ensureUsersProfile({
      supabaseUrl: input.env.supabaseUrl,
      serviceRoleKey: input.env.supabaseServiceRoleKey,
      authUserId,
      bootstrapEmail
    });
  } catch {
    return {
      ok: false,
      reason: "auth_failed",
      logCode: "PROFILE_BOOTSTRAP_FAILED",
      clearAppSession: false
    };
  }

  if (profile.is_disabled) {
    return {
      ok: false,
      reason: "disabled",
      logCode: "USER_DISABLED",
      clearAppSession: true
    };
  }

  try {
    const appSessionPayload = createAppSessionPayload({
      subject: authUserId,
      ttlSeconds: input.env.appSessionTtlSeconds
    });
    const appSessionCookie = buildAppSessionCookie({
      cookieName: input.env.appSessionCookieName,
      payload: appSessionPayload,
      secret: input.env.appSessionSecret,
      secure: input.secure,
      maxAgeSeconds: input.env.appSessionTtlSeconds
    });

    const successUrl = buildSuccessUrl(input.env.appBaseUrl, input.returnTo || "/");
    const response = NextResponse.redirect(successUrl, { status: 302 });
    response.cookies.set(appSessionCookie.name, appSessionCookie.value, appSessionCookie.options);
    clearCookie(response, { name: input.authAttemptCookieName, secure: input.secure });
    return {
      ok: true,
      response
    };
  } catch {
    return {
      ok: false,
      reason: "auth_failed",
      logCode: "SESSION_ISSUE_FAILED",
      clearAppSession: false
    };
  }
};

