import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const AUTH_ATTEMPT_VERSION = 1;
const APP_SESSION_VERSION = 1;
const SAFE_RETURN_TO_FALLBACK = "/";

export interface AuthAttemptPayload {
  v: number;
  state: string;
  nonce: string;
  returnTo: string;
  iat: number;
  exp: number;
}

export interface AuthAttemptVerifyResult {
  ok: boolean;
  payload?: AuthAttemptPayload;
  reason?: "missing" | "malformed" | "signature" | "payload" | "expired";
}

export interface AppSessionPayload {
  v: number;
  sub: string;
  iat: number;
  exp: number;
  sid: string;
}

export interface AppSessionVerifyResult {
  ok: boolean;
  payload?: AppSessionPayload;
  reason?: "missing" | "malformed" | "signature" | "payload" | "expired";
}

interface BuildAuthAttemptCookieInput {
  cookieName: string;
  payload: AuthAttemptPayload;
  secret: string;
  secure: boolean;
  maxAgeSeconds: number;
}

interface BuildAppSessionCookieInput {
  cookieName: string;
  payload: AppSessionPayload;
  secret: string;
  secure: boolean;
  maxAgeSeconds: number;
}

const base64UrlEncode = (value: Buffer | string): string => {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8");
  return buffer.toString("base64url");
};

const base64UrlDecode = (value: string): Buffer => {
  return Buffer.from(value, "base64url");
};

const createSignature = (unsignedToken: string, secret: string): Buffer => {
  return createHmac("sha256", secret).update(unsignedToken).digest();
};

const createRandomToken = (numBytes = 32): string => {
  return randomBytes(numBytes).toString("base64url");
};

export const shouldUseSecureCookies = (appBaseUrl: string, requestProtocol: string): boolean => {
  if (requestProtocol === "https:") {
    return true;
  }

  return appBaseUrl.startsWith("https://");
};

export const resolveSafeReturnTo = (value: string | null | undefined): string => {
  if (!value) {
    return SAFE_RETURN_TO_FALLBACK;
  }

  if (!value.startsWith("/") || value.startsWith("//")) {
    return SAFE_RETURN_TO_FALLBACK;
  }

  try {
    const parsed = new URL(value, "http://local.lifetime");
    if (parsed.origin !== "http://local.lifetime") {
      return SAFE_RETURN_TO_FALLBACK;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return SAFE_RETURN_TO_FALLBACK;
  }
};

export const createAuthAttemptPayload = (input: { returnTo: string; ttlSeconds: number }): AuthAttemptPayload => {
  const issuedAt = Math.floor(Date.now() / 1000);
  return {
    v: AUTH_ATTEMPT_VERSION,
    state: createRandomToken(),
    nonce: createRandomToken(),
    returnTo: resolveSafeReturnTo(input.returnTo),
    iat: issuedAt,
    exp: issuedAt + input.ttlSeconds
  };
};

export const createAppSessionPayload = (input: { subject: string; ttlSeconds: number }): AppSessionPayload => {
  const subject = input.subject.trim();
  if (!subject) {
    throw new Error("App session subject must not be blank");
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  return {
    v: APP_SESSION_VERSION,
    sub: subject,
    iat: issuedAt,
    exp: issuedAt + input.ttlSeconds,
    sid: createRandomToken()
  };
};

export const signAuthAttemptPayload = (payload: AuthAttemptPayload, secret: string): string => {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = createSignature(encodedPayload, secret);
  return `${encodedPayload}.${base64UrlEncode(signature)}`;
};

export const signAppSessionPayload = (payload: AppSessionPayload, secret: string): string => {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = createSignature(encodedPayload, secret);
  return `${encodedPayload}.${base64UrlEncode(signature)}`;
};

export const verifyAuthAttemptToken = (
  token: string | undefined,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000)
): AuthAttemptVerifyResult => {
  if (!token) {
    return { ok: false, reason: "missing" };
  }

  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, reason: "malformed" };
  }

  const [encodedPayload, encodedSignature] = parts;
  const expectedSignature = createSignature(encodedPayload, secret);
  let providedSignature: Buffer;
  try {
    providedSignature = base64UrlDecode(encodedSignature);
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (
    providedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(providedSignature, expectedSignature)
  ) {
    return { ok: false, reason: "signature" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(base64UrlDecode(encodedPayload).toString("utf8"));
  } catch {
    return { ok: false, reason: "payload" };
  }

  if (!parsed || typeof parsed !== "object") {
    return { ok: false, reason: "payload" };
  }

  const payload = parsed as Partial<AuthAttemptPayload>;
  if (
    payload.v !== AUTH_ATTEMPT_VERSION ||
    typeof payload.state !== "string" ||
    typeof payload.nonce !== "string" ||
    typeof payload.returnTo !== "string" ||
    typeof payload.iat !== "number" ||
    typeof payload.exp !== "number"
  ) {
    return { ok: false, reason: "payload" };
  }

  if (payload.exp <= nowSeconds) {
    return { ok: false, reason: "expired" };
  }

  return {
    ok: true,
    payload: {
      v: payload.v,
      state: payload.state,
      nonce: payload.nonce,
      returnTo: resolveSafeReturnTo(payload.returnTo),
      iat: payload.iat,
      exp: payload.exp
    }
  };
};

export const buildAuthAttemptCookie = (input: BuildAuthAttemptCookieInput) => {
  return {
    name: input.cookieName,
    value: signAuthAttemptPayload(input.payload, input.secret),
    options: {
      httpOnly: true as const,
      sameSite: "lax" as const,
      secure: input.secure,
      path: "/",
      maxAge: input.maxAgeSeconds
    }
  };
};

export const buildAppSessionCookie = (input: BuildAppSessionCookieInput) => {
  return {
    name: input.cookieName,
    value: signAppSessionPayload(input.payload, input.secret),
    options: {
      httpOnly: true as const,
      sameSite: "lax" as const,
      secure: input.secure,
      path: "/",
      maxAge: input.maxAgeSeconds
    }
  };
};

export const verifyAppSessionToken = (
  token: string | undefined,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000)
): AppSessionVerifyResult => {
  if (!token) {
    return { ok: false, reason: "missing" };
  }

  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, reason: "malformed" };
  }

  const [encodedPayload, encodedSignature] = parts;
  const expectedSignature = createSignature(encodedPayload, secret);

  let providedSignature: Buffer;
  try {
    providedSignature = base64UrlDecode(encodedSignature);
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (
    providedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(providedSignature, expectedSignature)
  ) {
    return { ok: false, reason: "signature" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(base64UrlDecode(encodedPayload).toString("utf8"));
  } catch {
    return { ok: false, reason: "payload" };
  }

  if (!parsed || typeof parsed !== "object") {
    return { ok: false, reason: "payload" };
  }

  const payload = parsed as Partial<AppSessionPayload>;
  if (
    payload.v !== APP_SESSION_VERSION ||
    typeof payload.sub !== "string" ||
    payload.sub.trim().length === 0 ||
    typeof payload.sid !== "string" ||
    payload.sid.length === 0 ||
    typeof payload.iat !== "number" ||
    typeof payload.exp !== "number"
  ) {
    return { ok: false, reason: "payload" };
  }

  if (payload.exp <= nowSeconds) {
    return { ok: false, reason: "expired" };
  }

  return {
    ok: true,
    payload: {
      v: payload.v,
      sub: payload.sub.trim(),
      sid: payload.sid,
      iat: payload.iat,
      exp: payload.exp
    }
  };
};
