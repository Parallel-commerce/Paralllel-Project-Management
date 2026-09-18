import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

function encryptionKey() {
  const secret = process.env.SHOPIFY_TOKEN_ENCRYPTION_KEY?.trim();
  if (!secret) {
    throw new Error("SHOPIFY_TOKEN_ENCRYPTION_KEY is not set.");
  }
  return createHash("sha256").update(secret).digest();
}

export function hasShopifyEncryptionKey() {
  return Boolean(process.env.SHOPIFY_TOKEN_ENCRYPTION_KEY?.trim());
}

export function encryptSecret(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptSecret(payload: string) {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Invalid ciphertext.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivB64, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function signPayload(payload: string) {
  const secret = process.env.SHOPIFY_TOKEN_ENCRYPTION_KEY?.trim();
  if (!secret) {
    throw new Error("SHOPIFY_TOKEN_ENCRYPTION_KEY is not set.");
  }
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function signedToken(payload: string) {
  return `${payload}.${signPayload(payload)}`;
}

export function verifySignedToken(token: string) {
  const split = token.lastIndexOf(".");
  if (split <= 0) return null;
  const payload = token.slice(0, split);
  const signature = token.slice(split + 1);
  const expected = signPayload(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return null;
  }
  return payload;
}

export function timingSafeHexEqual(left: string, right: string) {
  try {
    const a = Buffer.from(left, "hex");
    const b = Buffer.from(right, "hex");
    return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
