import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export interface State {
  packageId: string;
  admin: string;
  pilots: string[];
}

const STATE_PATH = resolve(process.cwd(), "asteria-state.json");

export function loadState(): State | undefined {
  if (!existsSync(STATE_PATH)) return undefined;
  const raw = JSON.parse(readFileSync(STATE_PATH, "utf8")) as Partial<State> & { pilot?: string };
  const pilots = raw.pilots ?? (raw.pilot ? [raw.pilot] : []);
  return { packageId: raw.packageId ?? "", admin: raw.admin ?? "", pilots };
}

export function saveState(state: State): void {
  writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`);
}
