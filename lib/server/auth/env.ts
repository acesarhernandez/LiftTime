const AUTH_ATTEMPT_TTL_MAX_SECONDS = 600;
const AUTH_ATTEMPT_TTL_DEFAULT_SECONDS = 600;
const AUTH_ATTEMPT_COOKIE_NAME_DEFAULT = "lt_auth_attempt";
const APP_SESSION_COOKIE_NAME_DEFAULT = "lt_session";

export interface AuthEnv {
  authentikIssuerUrl: string;
  authentikAuthorizationEndpoint: string;
  authentikTokenEndpoint: string;
  authentikJwksUri: string;
  authentikClientId: string;
  authentikClientSecret: string;
  authentikRedirectUri: string;
  appBaseUrl: string;
  appSessionSecret: string;
  appSessionTtlSeconds: number;
  appSessionRefreshWindowSeconds: number;
  appSessionCookieName: string;
  authAttemptCookieName: string;
  authAttemptTtlSeconds: number;
  supabaseServiceRoleKey: string;
}

const getRequired = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }

  return value;
};

const parsePositiveInt = (name: string, rawValue: string): number => {
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Env var ${name} must be a positive integer`);
  }

  return parsed;
};

const toNormalizedUrl = (name: string, value: string): string => {
  try {
    const url = new URL(value);
    return url.toString();
  } catch {
    throw new Error(`Env var ${name} must be an absolute URL`);
  }
};

export const getAuthEnv = (): AuthEnv => {
  const appSessionSecret = getRequired("APP_SESSION_SECRET");
  if (appSessionSecret.length < 32) {
    throw new Error("APP_SESSION_SECRET must be at least 32 characters");
  }

  const appSessionTtlSeconds = parsePositiveInt("APP_SESSION_TTL_SECONDS", getRequired("APP_SESSION_TTL_SECONDS"));
  const appSessionRefreshWindowSeconds = parsePositiveInt(
    "APP_SESSION_REFRESH_WINDOW_SECONDS",
    getRequired("APP_SESSION_REFRESH_WINDOW_SECONDS")
  );

  const authAttemptTtlRaw = process.env.APP_AUTH_ATTEMPT_TTL_SECONDS?.trim();
  const authAttemptTtlSeconds = authAttemptTtlRaw
    ? parsePositiveInt("APP_AUTH_ATTEMPT_TTL_SECONDS", authAttemptTtlRaw)
    : AUTH_ATTEMPT_TTL_DEFAULT_SECONDS;

  if (authAttemptTtlSeconds > AUTH_ATTEMPT_TTL_MAX_SECONDS) {
    throw new Error("APP_AUTH_ATTEMPT_TTL_SECONDS cannot exceed 600 seconds");
  }

  return {
    authentikIssuerUrl: toNormalizedUrl("AUTHENTIK_ISSUER_URL", getRequired("AUTHENTIK_ISSUER_URL")),
    authentikAuthorizationEndpoint: toNormalizedUrl(
      "AUTHENTIK_AUTHORIZATION_ENDPOINT",
      getRequired("AUTHENTIK_AUTHORIZATION_ENDPOINT")
    ),
    authentikTokenEndpoint: toNormalizedUrl("AUTHENTIK_TOKEN_ENDPOINT", getRequired("AUTHENTIK_TOKEN_ENDPOINT")),
    authentikJwksUri: toNormalizedUrl("AUTHENTIK_JWKS_URI", getRequired("AUTHENTIK_JWKS_URI")),
    authentikClientId: getRequired("AUTHENTIK_CLIENT_ID"),
    authentikClientSecret: getRequired("AUTHENTIK_CLIENT_SECRET"),
    authentikRedirectUri: toNormalizedUrl("AUTHENTIK_REDIRECT_URI", getRequired("AUTHENTIK_REDIRECT_URI")),
    appBaseUrl: toNormalizedUrl("APP_BASE_URL", getRequired("APP_BASE_URL")),
    appSessionSecret,
    appSessionTtlSeconds,
    appSessionRefreshWindowSeconds,
    appSessionCookieName: process.env.APP_SESSION_COOKIE_NAME?.trim() || APP_SESSION_COOKIE_NAME_DEFAULT,
    authAttemptCookieName: process.env.APP_AUTH_ATTEMPT_COOKIE_NAME?.trim() || AUTH_ATTEMPT_COOKIE_NAME_DEFAULT,
    authAttemptTtlSeconds,
    supabaseServiceRoleKey: getRequired("SUPABASE_SERVICE_ROLE_KEY")
  };
};
