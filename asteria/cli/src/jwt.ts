import { createHmac } from "node:crypto";

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function createToken(userId: string, audience: string, secret: string): string {
  const header = { alg: "HS256", typ: "JWT" };
  const payload = { sub: userId, aud: audience };
  const signing = `${encode(header)}.${encode(payload)}`;
  const signature = createHmac("sha256", secret).update(signing).digest("base64url");
  return `${signing}.${signature}`;
}