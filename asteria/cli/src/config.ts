import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export interface Config {
  host: string;
  providerPort: number;
  userPort: number;
  providerUrlOverride?: string;
  userUrlOverride?: string;
  audience: string;
  userId: string;
  packageId: string;
  secret: string;
}

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  const lines = readFileSync(path, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export function loadConfig(): Config {
  for (const candidate of [
    resolve(process.cwd(), ".env"),
    resolve(here, "../../devnet/.env"),
    resolve(here, "../../../devnet/.env"),
  ]) {
    loadEnvFile(candidate);
  }

  return {
    host: process.env.ASTERIA_HOST ?? process.env.HOST ?? "localhost",
    providerPort: Number(process.env.ASTERIA_PROVIDER_PORT ?? process.env.APP_PROVIDER_JSON_PORT ?? 3975),
    userPort: Number(process.env.ASTERIA_USER_PORT ?? process.env.APP_USER_JSON_PORT ?? 2975),
    providerUrlOverride: process.env.ASTERIA_PROVIDER_URL,
    userUrlOverride: process.env.ASTERIA_USER_URL,
    audience: process.env.ASTERIA_AUDIENCE ?? process.env.AUTH_AUDIENCE ?? "https://canton.network.global",
    userId: process.env.ASTERIA_USER ?? process.env.LEDGER_USER ?? "ledger-api-user",
    packageId: process.env.ASTERIA_PACKAGE_ID ?? process.env.PACKAGE_ID ?? "",
    secret: process.env.ASTERIA_SECRET ?? "unsafe",
  };
}

export function providerUrl(config: Config): string {
  return config.providerUrlOverride ?? `http://${config.host}:${config.providerPort}`;
}

export function userUrl(config: Config): string {
  return config.userUrlOverride ?? `http://${config.host}:${config.userPort}`;
}