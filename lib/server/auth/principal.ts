import { createHash, randomBytes } from "node:crypto";

export const TECHNICAL_PRINCIPAL_PROVIDER = "authentik" as const;
export const TECHNICAL_EMAIL_DOMAIN = "lifttime.local" as const;
export const TECHNICAL_EMAIL_HASH_LENGTH = 32;

export interface AuthentikIdentityKey {
  issuer: string;
  subject: string;
}

export interface TechnicalPrincipalMetadata {
  provider: typeof TECHNICAL_PRINCIPAL_PROVIDER;
  issuer: string;
  subject: string;
  is_technical_principal: true;
}

export interface ResolveOrCreateTechnicalPrincipalInput {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  identity: AuthentikIdentityKey;
  providerEmail: string | null;
}

export interface ResolvedFromMappingResult {
  outcome: "resolved_from_mapping";
  identity: AuthentikIdentityKey;
  authUserId: string;
}

export interface CreatedTechnicalPrincipalResult {
  outcome: "created_technical_principal";
  identity: AuthentikIdentityKey;
  authUserId: string;
  syntheticEmail: string;
  metadata: TechnicalPrincipalMetadata;
}

export interface ResolvedFromRaceWinnerResult {
  outcome: "resolved_from_race_winner";
  identity: AuthentikIdentityKey;
  authUserId: string;
  attemptedOrphanCleanup: boolean;
  orphanCleanupSucceeded: boolean | null;
}

export interface MappingIntegrityConflictResult {
  outcome: "mapping_integrity_conflict";
  identity: AuthentikIdentityKey;
  conflictingAuthUserId: string;
}

export type ResolveOrCreateTechnicalPrincipalResult =
  | ResolvedFromMappingResult
  | CreatedTechnicalPrincipalResult
  | ResolvedFromRaceWinnerResult
  | MappingIntegrityConflictResult;

interface AuthIdentityMapRow {
  issuer: string;
  subject: string;
  auth_user_id: string;
}

interface CreateAuthUserResponse {
  id?: string;
}

interface SupabaseErrorResponse {
  code?: string;
  error?: string;
  msg?: string;
  message?: string;
}

export class PrincipalWiringError extends Error {
  constructor(
    public readonly code:
      | "SUPABASE_URL_INVALID"
      | "SERVICE_ROLE_KEY_MISSING"
      | "MAPPING_LOOKUP_FAILED"
      | "MAPPING_INSERT_FAILED"
      | "MAPPING_TOUCH_FAILED"
      | "ADMIN_USER_CREATE_FAILED",
    message?: string
  ) {
    super(message ?? code);
    this.name = "PrincipalWiringError";
  }
}

export class MappingIntegrityConflictError extends Error {
  constructor(
    public readonly identity: AuthentikIdentityKey,
    public readonly conflictingAuthUserId: string
  ) {
    super("AUTH_IDENTITY_MAP_INTEGRITY_CONFLICT");
    this.name = "MappingIntegrityConflictError";
  }
}

const normalizePath = (pathname: string): string => {
  if (pathname === "/") {
    return "/";
  }

  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed || "/";
};

const normalizeSubject = (subject: string): string => {
  const trimmed = subject.trim();
  if (!trimmed) {
    throw new Error("Identity subject must not be blank");
  }

  return trimmed;
};

export const canonicalizeIssuer = (issuer: string): string => {
  const trimmed = issuer.trim();
  if (!trimmed) {
    throw new Error("Identity issuer must not be blank");
  }

  const url = new URL(trimmed);
  const normalizedPath = normalizePath(url.pathname);
  return `${url.protocol}//${url.host}${normalizedPath}`;
};

export const buildCanonicalAuthentikIdentity = (issuer: string, subject: string): AuthentikIdentityKey => {
  return {
    issuer: canonicalizeIssuer(issuer),
    subject: normalizeSubject(subject)
  };
};

export const createSyntheticTechnicalEmail = (identity: AuthentikIdentityKey): string => {
  const canonical = buildCanonicalAuthentikIdentity(identity.issuer, identity.subject);
  const material = `${canonical.issuer}|${canonical.subject}`;
  const hash = createHash("sha256").update(material, "utf8").digest("hex").slice(0, TECHNICAL_EMAIL_HASH_LENGTH);
  return `${TECHNICAL_PRINCIPAL_PROVIDER}+${hash}@${TECHNICAL_EMAIL_DOMAIN}`;
};

export const buildTechnicalPrincipalMetadata = (identity: AuthentikIdentityKey): TechnicalPrincipalMetadata => {
  const canonical = buildCanonicalAuthentikIdentity(identity.issuer, identity.subject);
  return {
    provider: TECHNICAL_PRINCIPAL_PROVIDER,
    issuer: canonical.issuer,
    subject: canonical.subject,
    is_technical_principal: true
  };
};

export const normalizeMaybeEmail = (value: string | null | undefined): string | null => {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeSupabaseUrl = (supabaseUrl: string): string => {
  const trimmed = supabaseUrl.trim();
  if (!trimmed) {
    throw new PrincipalWiringError("SUPABASE_URL_INVALID", "Supabase URL must not be blank");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new PrincipalWiringError("SUPABASE_URL_INVALID", "Supabase URL must be absolute");
  }

  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return parsed.toString().replace(/\/+$/, "");
};

const createServiceHeaders = (serviceRoleKey: string, includeJson = true): HeadersInit => {
  if (!serviceRoleKey.trim()) {
    throw new PrincipalWiringError("SERVICE_ROLE_KEY_MISSING", "Service role key must not be blank");
  }

  const headers: Record<string, string> = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`
  };

  if (includeJson) {
    headers["Content-Type"] = "application/json";
  }

  return headers;
};

const parseMaybeSupabaseError = async (response: Response): Promise<SupabaseErrorResponse | null> => {
  try {
    return (await response.json()) as SupabaseErrorResponse;
  } catch {
    return null;
  }
};

const buildIdentityLookupQuery = (identity: AuthentikIdentityKey): string => {
  const params = new URLSearchParams({
    select: "issuer,subject,auth_user_id",
    issuer: `eq.${identity.issuer}`,
    subject: `eq.${identity.subject}`,
    limit: "1"
  });

  return params.toString();
};

const buildAuthUserLookupQuery = (authUserId: string): string => {
  const params = new URLSearchParams({
    select: "issuer,subject,auth_user_id",
    auth_user_id: `eq.${authUserId}`,
    limit: "1"
  });

  return params.toString();
};

const fetchMappingByIdentity = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  identity: AuthentikIdentityKey
): Promise<AuthIdentityMapRow | null> => {
  const response = await fetch(`${supabaseUrl}/rest/v1/auth_identity_map?${buildIdentityLookupQuery(identity)}`, {
    method: "GET",
    headers: createServiceHeaders(serviceRoleKey, false),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new PrincipalWiringError("MAPPING_LOOKUP_FAILED", "Failed to lookup identity mapping");
  }

  const rows = (await response.json()) as AuthIdentityMapRow[];
  return rows[0] ?? null;
};

const fetchMappingByAuthUserId = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  authUserId: string
): Promise<AuthIdentityMapRow | null> => {
  const response = await fetch(`${supabaseUrl}/rest/v1/auth_identity_map?${buildAuthUserLookupQuery(authUserId)}`, {
    method: "GET",
    headers: createServiceHeaders(serviceRoleKey, false),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new PrincipalWiringError("MAPPING_LOOKUP_FAILED", "Failed to lookup mapping by auth user id");
  }

  const rows = (await response.json()) as AuthIdentityMapRow[];
  return rows[0] ?? null;
};

const touchLastSeenAt = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  identity: AuthentikIdentityKey
): Promise<void> => {
  const query = buildIdentityLookupQuery(identity);
  const response = await fetch(`${supabaseUrl}/rest/v1/auth_identity_map?${query}`, {
    method: "PATCH",
    headers: createServiceHeaders(serviceRoleKey),
    body: JSON.stringify({
      last_seen_at: new Date().toISOString()
    }),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new PrincipalWiringError("MAPPING_TOUCH_FAILED", "Failed to update mapping last_seen_at");
  }
};

const createTechnicalPrincipal = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  syntheticEmail: string,
  metadata: TechnicalPrincipalMetadata
): Promise<string> => {
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: createServiceHeaders(serviceRoleKey),
    body: JSON.stringify({
      email: syntheticEmail,
      password: randomBytes(24).toString("hex"),
      email_confirm: true,
      app_metadata: metadata
    }),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new PrincipalWiringError("ADMIN_USER_CREATE_FAILED", "Failed to create technical principal");
  }

  let payload: CreateAuthUserResponse;
  try {
    payload = (await response.json()) as CreateAuthUserResponse;
  } catch {
    throw new PrincipalWiringError("ADMIN_USER_CREATE_FAILED", "Auth admin create response was invalid");
  }

  if (!payload.id || typeof payload.id !== "string") {
    throw new PrincipalWiringError("ADMIN_USER_CREATE_FAILED", "Auth admin create response missing user id");
  }

  return payload.id;
};

const insertMapping = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  identity: AuthentikIdentityKey,
  authUserId: string
): Promise<{ inserted: true } | { inserted: false; isUniqueConflict: boolean }> => {
  const response = await fetch(`${supabaseUrl}/rest/v1/auth_identity_map`, {
    method: "POST",
    headers: {
      ...createServiceHeaders(serviceRoleKey),
      Prefer: "return=representation"
    },
    body: JSON.stringify({
      issuer: identity.issuer,
      subject: identity.subject,
      auth_user_id: authUserId
    }),
    cache: "no-store"
  });

  if (response.ok) {
    return { inserted: true };
  }

  const maybeError = await parseMaybeSupabaseError(response);
  if (response.status === 409 || maybeError?.code === "23505") {
    return { inserted: false, isUniqueConflict: true };
  }

  throw new PrincipalWiringError("MAPPING_INSERT_FAILED", "Failed to insert auth identity mapping");
};

const deleteTechnicalPrincipalBestEffort = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  authUserId: string
): Promise<boolean> => {
  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/admin/users/${authUserId}`, {
      method: "DELETE",
      headers: createServiceHeaders(serviceRoleKey, false),
      cache: "no-store"
    });

    return response.ok;
  } catch {
    return false;
  }
};

const isSameIdentity = (left: AuthentikIdentityKey, right: AuthIdentityMapRow): boolean => {
  return left.issuer === right.issuer && left.subject === right.subject;
};

export const resolveOrCreateTechnicalPrincipal = async (
  input: ResolveOrCreateTechnicalPrincipalInput
): Promise<ResolveOrCreateTechnicalPrincipalResult> => {
  const providerEmail = normalizeMaybeEmail(input.providerEmail);
  void providerEmail;

  const canonicalIdentity = buildCanonicalAuthentikIdentity(input.identity.issuer, input.identity.subject);
  const supabaseUrl = normalizeSupabaseUrl(input.supabaseUrl);
  const serviceRoleKey = input.supabaseServiceRoleKey.trim();

  const existing = await fetchMappingByIdentity(supabaseUrl, serviceRoleKey, canonicalIdentity);
  if (existing) {
    await touchLastSeenAt(supabaseUrl, serviceRoleKey, canonicalIdentity);
    return {
      outcome: "resolved_from_mapping",
      identity: canonicalIdentity,
      authUserId: existing.auth_user_id
    };
  }

  const syntheticEmail = createSyntheticTechnicalEmail(canonicalIdentity);
  const metadata = buildTechnicalPrincipalMetadata(canonicalIdentity);
  let createdAuthUserId: string;
  try {
    createdAuthUserId = await createTechnicalPrincipal(supabaseUrl, serviceRoleKey, syntheticEmail, metadata);
  } catch (error) {
    const racedIdentityMapping = await fetchMappingByIdentity(supabaseUrl, serviceRoleKey, canonicalIdentity);
    if (racedIdentityMapping) {
      await touchLastSeenAt(supabaseUrl, serviceRoleKey, canonicalIdentity);
      return {
        outcome: "resolved_from_race_winner",
        identity: canonicalIdentity,
        authUserId: racedIdentityMapping.auth_user_id,
        attemptedOrphanCleanup: false,
        orphanCleanupSucceeded: null
      };
    }

    throw error;
  }

  const insertResult = await insertMapping(supabaseUrl, serviceRoleKey, canonicalIdentity, createdAuthUserId);
  if (insertResult.inserted) {
    return {
      outcome: "created_technical_principal",
      identity: canonicalIdentity,
      authUserId: createdAuthUserId,
      syntheticEmail,
      metadata
    };
  }

  const racedIdentityMapping = await fetchMappingByIdentity(supabaseUrl, serviceRoleKey, canonicalIdentity);
  if (racedIdentityMapping) {
    await touchLastSeenAt(supabaseUrl, serviceRoleKey, canonicalIdentity);
    if (racedIdentityMapping.auth_user_id === createdAuthUserId) {
      return {
        outcome: "resolved_from_race_winner",
        identity: canonicalIdentity,
        authUserId: racedIdentityMapping.auth_user_id,
        attemptedOrphanCleanup: false,
        orphanCleanupSucceeded: null
      };
    }

    const cleanupSucceeded = await deleteTechnicalPrincipalBestEffort(supabaseUrl, serviceRoleKey, createdAuthUserId);
    return {
      outcome: "resolved_from_race_winner",
      identity: canonicalIdentity,
      authUserId: racedIdentityMapping.auth_user_id,
      attemptedOrphanCleanup: true,
      orphanCleanupSucceeded: cleanupSucceeded
    };
  }

  const conflictingByUser = await fetchMappingByAuthUserId(supabaseUrl, serviceRoleKey, createdAuthUserId);
  if (conflictingByUser && !isSameIdentity(canonicalIdentity, conflictingByUser)) {
    throw new MappingIntegrityConflictError(canonicalIdentity, conflictingByUser.auth_user_id);
  }

  throw new PrincipalWiringError(
    "MAPPING_INSERT_FAILED",
    "Mapping insert raced but winning mapping could not be resolved safely"
  );
};
