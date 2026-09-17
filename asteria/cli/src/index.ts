#!/usr/bin/env node
import { parseArgs } from "node:util";
import { loadConfig } from "./config.js";
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
import { playCommand } from "./repl.js";

const HELP = `Asteria CLI

Uso: asteria <comando> [argumentos]

Comandos:
  status            Estado de la devnet: ledger-end y packages de cada participante
  init              Crea o reutiliza las parties admin y piloto, y les da derechos al usuario
  setup             Crea el juego, el pozo, el shipyard y un pellet
  reset             Archiva los contratos de la partida para poder hacer setup de nuevo
  mint [x] [y]      Mintea una nave en (x,y). Por defecto (10,10)
  move <dx> <dy>    Mueve la nave
  gather <cantidad> Junta combustible del pellet en la posición de la nave
  mine              Mina el pozo si la nave está en (0,0)
  quit              Abandona la partida
  grid              Muestra la grilla
  tx <updateId>     Muestra la transacción (update) en detalle
  play (o repl)     Modo interactivo: los comandos anteriores sin salir de la sesión

Variables de entorno:
  ASTERIA_HOST, ASTERIA_PROVIDER_PORT, ASTERIA_USER_PORT
  ASTERIA_PACKAGE_ID, ASTERIA_AUDIENCE, ASTERIA_USER, ASTERIA_SECRET

También lee asteria/devnet/.env si existe.`;

async function main(): Promise<void> {
  const { positionals } = parseArgs({ allowPositionals: true });
  const [command, ...args] = positionals;
  const config = loadConfig();

  switch (command) {
    case "status":
      return statusCommand(config);
    case "init":
      return initCommand(config);
    case "setup":
      return setupCommand(config);
    case "reset":
      return resetCommand(config);
    case "mint":
      return mintCommand(config, Number(args[0] ?? 10), Number(args[1] ?? 10));
    case "move":
      return moveCommand(config, Number(args[0] ?? 0), Number(args[1] ?? 0));
    case "gather":
      return gatherCommand(config, Number(args[0] ?? 10));
    case "mine":
      return mineCommand(config);
    case "quit":
      return quitCommand(config);
    case "grid":
      return gridCommand(config);
    case "tx": {
      if (args[0] === undefined) throw new Error("falta el update id. Uso: asteria tx <updateId>");
      return txCommand(config, args[0]);
    }
    case "play":
    case "repl":
      return playCommand(config);
    default:
      console.log(HELP);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exit(1);
});