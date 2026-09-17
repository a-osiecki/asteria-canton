import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";
import type { Config } from "./config.js";
import {
  gatherCommand,
  gridCommand,
  initCommand,
  mineCommand,
  mintCommand,
  moveCommand,
  quitCommand,
  resetCommand,
  setupCommand,
  statusCommand,
  txCommand,
} from "./commands.js";
import { loadState } from "./state.js";

const REPL_HELP = `Comandos:
  help              Muestra esta ayuda
  status            Estado de la devnet
  init [pilotos]    Crea o reutiliza el admin y N pilotos (default 2)
  setup             Crea el juego, el pozo, el shipyard y un pellet
  reset             Archiva los contratos de la partida para hacer setup de nuevo
  mint [x] [y]      Mintea una nave en (x,y). Por defecto (10,10)
  move <dx> <dy>    Mueve la nave
  gather <cantidad> Junta combustible del pellet en la posición de la nave
  mine              Mina el pozo si la nave está en (0,0)
  quit              Abandona la partida
  grid              Muestra la grilla
  tx <updateId>     Muestra la transacción (update) en detalle
  exit              Sale del modo interactivo

Opciones:
  --as <n|hint>     Piloto sobre el que operar (default 1). Ej: move -5 -5 --as 2
  --private-ships   En setup: las naves solo las ven el admin y su piloto (default: publicas)`;

// Comandos que cambian el estado del juego: después se redibuja la grilla.
const GRID_AFTER = new Set(["setup", "mint", "move", "gather", "mine", "quit"]);

function splitAs(args: string[]): { as?: string; rest: string[] } {
  const rest: string[] = [];
  let as: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--as") {
      as = args[i + 1];
      i++;
      continue;
    }
    rest.push(args[i]);
  }
  return { as, rest };
}

function intArg(value: string | undefined, name: string, fallback?: number): number {
  if (value === undefined) {
    if (fallback !== undefined) return fallback;
    throw new Error(`falta ${name}`);
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${name} debe ser un entero`);
  return parsed;
}

async function runCommand(config: Config, cmd: string, args: string[]): Promise<void> {
  const { as, rest } = splitAs(args);
  switch (cmd) {
    case "help":
    case "ayuda":
      console.log(REPL_HELP);
      return;
    case "status":
      return statusCommand(config);
    case "init":
      return initCommand(config, rest[0] === undefined ? undefined : Number(rest[0]));
    case "setup":
      return setupCommand(config, rest.includes("--private-ships"));
    case "reset":
      return resetCommand(config);
    case "mint":
      return mintCommand(config, intArg(rest[0], "x", 10), intArg(rest[1], "y", 10), as);
    case "move":
      return moveCommand(config, intArg(rest[0], "dx"), intArg(rest[1], "dy"), as);
    case "gather":
      return gatherCommand(config, intArg(rest[0], "cantidad", 10), as);
    case "mine":
      return mineCommand(config, as);
    case "quit":
      return quitCommand(config, as);
    case "grid":
      return gridCommand(config, as);
    case "tx": {
      if (rest[0] === undefined) throw new Error("falta el update id. Uso: tx <updateId>");
      return txCommand(config, rest[0]);
    }
    default:
      throw new Error(`comando desconocido: ${cmd}. Probá 'help'.`);
  }
}

export async function playCommand(config: Config): Promise<void> {
  const state = loadState();
  if (state) console.log(`Pilotos: ${state.pilots.map((pilot) => pilot.split("::")[0]).join(", ")}`);
  else console.log("Sin estado de partida: corré 'init' y 'setup' para empezar.");
  console.log(REPL_HELP);
  console.log();

  const rl = createInterface({ input: stdin, output: stdout, prompt: "asteria> " });
  let done = false;
  let queue: Promise<void> = Promise.resolve();

  rl.on("line", (line) => {
    queue = queue
      .then(async () => {
        if (done) return;
        const parts = line
          .trim()
          .split(/\s+/)
          .filter((part) => part !== "");
        if (parts[0] === "asteria") parts.shift();
        const [cmd, ...args] = parts;
        if (cmd === undefined) return;
        if (cmd === "exit" || cmd === "salir") {
          done = true;
          rl.close();
          return;
        }
        try {
          const { as } = splitAs(args);
          await runCommand(config, cmd, args);
          if (GRID_AFTER.has(cmd)) {
            console.log();
            await gridCommand(config, as);
          }
        } catch (error) {
          console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
        }
      })
      .catch((error: unknown) => {
        console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      })
      .finally(() => {
        if (!done) rl.prompt();
      });
  });

  rl.on("SIGINT", () => {
    done = true;
    rl.close();
  });
  rl.on("close", () => {
    done = true;
  });

  rl.prompt();
  await new Promise<void>((resolve) => rl.on("close", resolve));
  console.log("Hasta la próxima.");
}
