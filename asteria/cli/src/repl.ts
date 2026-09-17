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
  setupCommand,
  statusCommand,
} from "./commands.js";
import { loadState } from "./state.js";

const REPL_HELP = `Comandos:
  help              Muestra esta ayuda
  status            Estado de la devnet
  init              Crea o reutiliza las parties admin y piloto
  setup             Crea el juego, el pozo, el shipyard y un pellet
  mint [x] [y]      Mintea una nave en (x,y). Por defecto (10,10)
  move <dx> <dy>    Mueve la nave
  gather <cantidad> Junta combustible del pellet en la posición de la nave
  mine              Mina el pozo si la nave está en (0,0)
  quit              Abandona la partida
  grid              Muestra la grilla
  exit              Sale del modo interactivo`;

// Comandos que cambian el estado del juego: después se redibuja la grilla.
const GRID_AFTER = new Set(["setup", "mint", "move", "gather", "mine", "quit"]);

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
  switch (cmd) {
    case "help":
    case "ayuda":
      console.log(REPL_HELP);
      return;
    case "status":
      return statusCommand(config);
    case "init":
      return initCommand(config);
    case "setup":
      return setupCommand(config);
    case "mint":
      return mintCommand(config, intArg(args[0], "x", 10), intArg(args[1], "y", 10));
    case "move":
      return moveCommand(config, intArg(args[0], "dx"), intArg(args[1], "dy"));
    case "gather":
      return gatherCommand(config, intArg(args[0], "cantidad", 10));
    case "mine":
      return mineCommand(config);
    case "quit":
      return quitCommand(config);
    case "grid":
      return gridCommand(config);
    default:
      throw new Error(`comando desconocido: ${cmd}. Probá 'help'.`);
  }
}

export async function playCommand(config: Config): Promise<void> {
  const state = loadState();
  if (state) console.log(`Piloto: ${state.pilot}`);
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
        const [cmd, ...args] = line.trim().split(/\s+/);
        if (cmd === "") return;
        if (cmd === "exit" || cmd === "salir") {
          done = true;
          rl.close();
          return;
        }
        try {
          await runCommand(config, cmd, args);
          if (GRID_AFTER.has(cmd)) {
            console.log();
            await gridCommand(config);
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
