import crypto from "crypto";

/**
 * API token format: `ff_<48 hex chars>`
 *
 * - The `ff_` prefix makes tokens recognizable in logs / git scanners.
 * - The displayed `prefix` we store alongside the hash is the first 8 chars
 *   AFTER the `ff_` (so users can identify which token a log line refers to
 *   without exposing the secret).
 * - Only the SHA-256 hash of the full plaintext token is persisted; the
 *   plaintext is returned to the caller exactly once at creation time.
 */

const TOKEN_PREFIX = "ff_";
const TOKEN_RANDOM_BYTES = 24; // → 48 hex chars
const DISPLAY_PREFIX_LEN = 8;

export interface GeneratedToken {
  plaintext: string;
  prefix: string;
  hash: string;
}

export function generateApiToken(): GeneratedToken {
  const random = crypto.randomBytes(TOKEN_RANDOM_BYTES).toString("hex");
  const plaintext = `${TOKEN_PREFIX}${random}`;
  return {
    plaintext,
    prefix: random.slice(0, DISPLAY_PREFIX_LEN),
    hash: hashApiToken(plaintext),
  };
}

export function hashApiToken(plaintext: string): string {
  return crypto.createHash("sha256").update(plaintext).digest("hex");
}

/**
 * Parses an `Authorization: Bearer <token>` header. Returns the plaintext
 * token if it has the expected `ff_` prefix and a plausible length, or null
 * otherwise. Returning null for malformed input lets callers fall through to
 * session-based auth without a 401.
 */
export function parseBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(\S+)$/i);
  if (!match) return null;
  const token = match[1];
  if (!token.startsWith(TOKEN_PREFIX)) return null;
  if (token.length < TOKEN_PREFIX.length + 16) return null;
  return token;
}
