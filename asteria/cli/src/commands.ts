import type { Config } from "./config.js";
import { providerUrl, userUrl } from "./config.js";
import type { ActiveContract, Json } from "./api.js";
import { JsonApi } from "./api.js";
import type { State } from "./state.js";
import { loadState, saveState } from "./state.js";
import type { PelletData, ShipData } from "./grid.js";
import { renderGrid } from "./grid.js";

const PACKAGE_NAME = "asteria-contracts";

const GAME = "Asteria.Asteria:Game";
const POOL = "Asteria.Asteria:PrizePool";
const SHIP = "Asteria.Spacetime:Ship";
const YARD = "Asteria.Spacetime:Shipyard";
const PELLET = "Asteria.Pellet:Pellet";
const GAME_ID = "asteria-1";

const SHIP_CONFIG = {
  maxSpeed: "20",
  maxFuel: "100",
  fuelPerStep: "1",
  initialFuel: "10",
  minAsteriaDistance: "5",
};

// En el JSON API de Daml, Int y Decimal se codifican como string.
function s(value: number): string {
  return String(value);
}

function num(value: unknown): number {
  return typeof value === "number" ? value : Number(value);
}

function shortParty(party: string): string {
  return party.split("::")[0];
}

function eventLine(event: Json): string {
  const created = event.CreatedEvent as Json | undefined;
  if (created) return `+ ${String(created.templateId)}`;
  const exercised = event.ExercisedEvent as Json | undefined;
  if (exercised) {
    const acting = ((exercised.actingParties ?? []) as string[]).map(shortParty).join(",");
    return `> ${String(exercised.templateId)} ${String(exercised.choice)} (${acting})`;
  }
  const archived = event.ArchivedEvent as Json | undefined;
  if (archived) return `- ${String(archived.templateId)}`;
  return JSON.stringify(event);
}

function clients(config: Config): { provider: JsonApi; user: JsonApi } {
  return {
    provider: new JsonApi(providerUrl(config), config.userId, config.audience, config.secret),
    user: new JsonApi(userUrl(config), config.userId, config.audience, config.secret),
  };
}

function tid(_config: Config, suffix: string): string {
  // Este participante espera la referencia por nombre de paquete (#nombre:Modulo:Entidad).
  return `#${PACKAGE_NAME}:${suffix}`;
}

function requireState(): State {
  const state = loadState();
  if (!state) throw new Error("Falta asteria-state.json. Corré 'asteria init' primero.");
  return state;
}

async function single(api: JsonApi, party: string, templateId: string, label: string): Promise<ActiveContract> {
  const contracts = await api.activeContracts(party, templateId);
  if (contracts.length === 0) throw new Error(`No se encontró ningún contrato de ${label}.`);
  if (contracts.length > 1) console.warn(`Aviso: hay ${contracts.length} contratos de ${label}, uso el primero.`);
  return contracts[0];
}

async function shipOf(user: JsonApi, pilot: string, config: Config): Promise<ActiveContract> {
  return single(user, pilot, tid(config, SHIP), "Ship");
}

export async function statusCommand(config: Config): Promise<void> {
  const { provider, user } = clients(config);
  for (const [nombre, api] of [
    ["app-provider", provider],
    ["app-user", user],
  ] as const) {
    try {
      const version = await api.version();
      const end = await api.ledgerEnd();
      const packages = await api.packages();
      const hasAsteria = config.packageId !== "" && packages.includes(config.packageId);
      console.log(`${nombre}: ledger-end ${end}, packages ${packages.length}, asteria ${hasAsteria ? "presente" : "ausente"}`);
      console.log(`  version: ${JSON.stringify(version).slice(0, 120)}`);
    } catch (error) {
      console.log(`${nombre}: sin respuesta (${(error as Error).message})`);
    }
  }
}

interface RightShape {
  kind?: {
    CanActAs?: { value?: { party?: string } };
    CanReadAs?: { value?: { party?: string } };
  };
}

async function ensureParty(api: JsonApi, hint: string): Promise<string> {
  const parties = await api.listParties();
  const existing = parties.find((p) => p.party.startsWith(`${hint}::`));
  if (existing) return existing.party;
  return api.allocateParty(hint);
}

async function ensureRights(api: JsonApi, party: string): Promise<void> {
  const rights = (await api.listRights()) as RightShape[];
  const hasActAs = rights.some((r) => r.kind?.CanActAs?.value?.party === party);
  const hasReadAs = rights.some((r) => r.kind?.CanReadAs?.value?.party === party);
  const toGrant: Json[] = [];
  if (!hasActAs) toGrant.push({ kind: { CanActAs: { value: { party } } } });
  if (!hasReadAs) toGrant.push({ kind: { CanReadAs: { value: { party } } } });
  if (toGrant.length > 0) await api.grantRights(toGrant);
}

export async function initCommand(config: Config): Promise<void> {
  const { provider, user } = clients(config);
  const packages = await provider.packages();
  if (config.packageId && !packages.includes(config.packageId)) {
    throw new Error("El DAR de Asteria no está subido en app-provider. Corré scripts/bootstrap-dar.sh.");
  }
  const admin = await ensureParty(provider, "asteria-admin");
  await ensureRights(provider, admin);
  const pilot = await ensureParty(user, "asteria-pilot");
  await ensureRights(user, pilot);
  saveState({ packageId: config.packageId, admin, pilot });
  console.log(`Admin (app-provider): ${admin}`);
  console.log(`Piloto (app-user):    ${pilot}`);
  console.log("Estado guardado en asteria-state.json");
}

export async function setupCommand(config: Config): Promise<void> {
  const state = requireState();
  const { provider } = clients(config);
  const admin = state.admin;
  const pilot = state.pilot;

  const existing = await provider.activeContracts(admin, tid(config, GAME));
  if (existing.length > 0) throw new Error("Ya hay un Game activo. Corré 'asteria reset' o borralo antes de recrear.");

  const gameTx = await provider.submit(
    [
      provider.create(tid(config, GAME), {
        admin,
        gameId: GAME_ID,
        shipCounter: s(0),
        shipMintFee: "0.0",
        observers: [pilot],
      }),
    ],
    [admin],
  );
  const poolTx = await provider.submit(
    [
      provider.create(tid(config, POOL), {
        admin,
        gameId: GAME_ID,
        pot: "100.0",
        maxAsteriaMining: s(50),
        observers: [pilot],
      }),
    ],
    [admin],
  );
  const game = await single(provider, admin, tid(config, GAME), "Game");
  const yardTx = await provider.submit(
    [
      provider.create(tid(config, YARD), {
        admin,
        gameId: GAME_ID,
        gameCid: game.contractId,
        config: SHIP_CONFIG,
        observers: [pilot],
      }),
    ],
    [admin],
  );
  const pelletTx = await provider.submit(
    [
      provider.create(tid(config, PELLET), {
        admin,
        gameId: GAME_ID,
        posX: s(5),
        posY: s(5),
        fuel: s(50),
        prize: "0.0",
        observers: [pilot],
      }),
    ],
    [admin],
  );
  console.log("Juego creado: Game, PrizePool, Shipyard y un pellet en (5,5) con 50 de combustible.");
  console.log(`tx Game:      ${gameTx.updateId}`);
  console.log(`tx PrizePool: ${poolTx.updateId}`);
  console.log(`tx Shipyard:  ${yardTx.updateId}`);
  console.log(`tx Pellet:    ${pelletTx.updateId}`);
  console.log("Ahora: asteria mint 10 10");
}

export async function mintCommand(config: Config, posX: number, posY: number): Promise<void> {
  const state = requireState();
  const { user } = clients(config);
  const yard = await single(user, state.pilot, tid(config, YARD), "Shipyard");
  const result = await user.submit(
    [
      user.exercise(tid(config, YARD), yard.contractId, "MintShip", {
        pilot: state.pilot,
        posX: s(posX),
        posY: s(posY),
      }),
    ],
    [state.pilot],
  );
  console.log(`Nave minteada en (${posX},${posY}).`);
  console.log(`tx: ${result.updateId}`);
}

export async function moveCommand(config: Config, deltaX: number, deltaY: number): Promise<void> {
  const state = requireState();
  const { user } = clients(config);
  const ship = await shipOf(user, state.pilot, config);
  const result = await user.submit(
    [user.exercise(tid(config, SHIP), ship.contractId, "Move", { deltaX: s(deltaX), deltaY: s(deltaY) })],
    [state.pilot],
  );
  console.log(`Nave movida por (${deltaX},${deltaY}).`);
  console.log(`tx: ${result.updateId}`);
}

export async function gatherCommand(config: Config, amount: number): Promise<void> {
  const state = requireState();
  const { user } = clients(config);
  const ship = await shipOf(user, state.pilot, config);
  const shipX = num(ship.argument.posX);
  const shipY = num(ship.argument.posY);
  const pellets = await user.activeContracts(state.pilot, tid(config, PELLET));
  const pellet = pellets.find((p) => num(p.argument.posX) === shipX && num(p.argument.posY) === shipY);
  if (!pellet) throw new Error(`No hay pellet en la posición de la nave (${shipX},${shipY}).`);
  const result = await user.submit(
    [
      user.exercise(tid(config, SHIP), ship.contractId, "GatherFuel", {
        pelletCid: pellet.contractId,
        amount: s(amount),
        prizeAmount: "0.0",
      }),
    ],
    [state.pilot],
  );
  console.log(`Juntaste ${amount} de combustible.`);
  console.log(`tx: ${result.updateId}`);
}

export async function mineCommand(config: Config): Promise<void> {
  const state = requireState();
  const { user } = clients(config);
  const ship = await shipOf(user, state.pilot, config);
  const pool = await single(user, state.pilot, tid(config, POOL), "PrizePool");
  const result = await user.submit(
    [user.exercise(tid(config, SHIP), ship.contractId, "Mine", { poolCid: pool.contractId })],
    [state.pilot],
  );
  console.log("Minaste el 50% del pozo. La nave quedó archivada.");
  console.log(`tx: ${result.updateId}`);
}

export async function quitCommand(config: Config): Promise<void> {
  const state = requireState();
  const { user } = clients(config);
  const ship = await shipOf(user, state.pilot, config);
  const result = await user.submit([user.exercise(tid(config, SHIP), ship.contractId, "Quit", {})], [state.pilot]);
  console.log("Abandonaste la partida. La nave quedó archivada.");
  console.log(`tx: ${result.updateId}`);
}

export async function resetCommand(config: Config): Promise<void> {
  const state = requireState();
  const { provider, user } = clients(config);

  const txs: string[] = [];
  const ships = await user.activeContracts(state.pilot, tid(config, SHIP));
  for (const ship of ships) {
    const result = await user.submit([user.exercise(tid(config, SHIP), ship.contractId, "Quit", {})], [state.pilot]);
    txs.push(result.updateId);
  }

  const counts: Array<[string, number]> = [["naves", ships.length]];
  const consumes: Array<[string, string, string]> = [
    [POOL, "ConsumePool", "pozos"],
    [GAME, "ConsumeGame", "juegos"],
    [PELLET, "Consume", "pellets"],
  ];
  for (const [template, choice, label] of consumes) {
    const contracts = await provider.activeContracts(state.admin, tid(config, template));
    for (const contract of contracts) {
      const result = await provider.submit(
        [provider.exercise(tid(config, template), contract.contractId, choice, {})],
        [state.admin],
      );
      txs.push(result.updateId);
    }
    counts.push([label, contracts.length]);
  }

  const yards = await provider.activeContracts(state.admin, tid(config, YARD));
  for (const yard of yards) {
    const result = await provider.submit(
      [provider.exercise(tid(config, YARD), yard.contractId, "Archive", {})],
      [state.admin],
    );
    txs.push(result.updateId);
  }
  counts.push(["shipyards", yards.length]);

  console.log(`Partida borrada: ${counts.map(([label, n]) => `${n} ${label}`).join(", ")}.`);
  for (const tx of txs) console.log(`tx: ${tx}`);
  console.log("Ahora podés correr 'setup' de nuevo.");
}

export async function gridCommand(config: Config): Promise<void> {
  const state = requireState();
  const { user } = clients(config);
  const ships: ShipData[] = (await user.activeContracts(state.pilot, tid(config, SHIP))).map((c) => ({
    serial: num(c.argument.serial),
    posX: num(c.argument.posX),
    posY: num(c.argument.posY),
    fuel: num(c.argument.fuel),
  }));
  const pellets: PelletData[] = (await user.activeContracts(state.pilot, tid(config, PELLET))).map((c) => ({
    posX: num(c.argument.posX),
    posY: num(c.argument.posY),
    fuel: num(c.argument.fuel),
  }));
  console.log(renderGrid(ships, pellets));
}

export async function txCommand(config: Config, updateId: string): Promise<void> {
  const state = requireState();
  const { provider, user } = clients(config);
  let data: Json;
  try {
    data = await user.updateById(updateId, state.pilot);
  } catch {
    data = await provider.updateById(updateId, state.admin);
  }
  const update = (data.update ?? {}) as Json;
  const wrapped = (update.Transaction ?? {}) as Json;
  const transaction = (wrapped.value ?? wrapped) as Json;
  const events = (transaction.events ?? []) as Json[];
  console.log(`update:     ${String(transaction.updateId ?? updateId)}`);
  console.log(`offset:     ${String(transaction.offset ?? "?")}`);
  console.log(`recordTime: ${String(transaction.recordTime ?? transaction.effectiveAt ?? "?")}`);
  console.log(`eventos:    ${events.length}`);
  for (const event of events) console.log(`  ${eventLine(event)}`);
}
