import { randomUUID } from "node:crypto";
import { createToken } from "./jwt.js";

export type Json = Record<string, unknown>;

export interface ActiveContract {
  contractId: string;
  argument: Record<string, unknown>;
}

export interface PartyDetails {
  party: string;
  isLocal?: boolean;
}

export interface SubmitResult {
  updateId: string;
  offset: number;
  transaction: Json;
}

export class JsonApi {
  private readonly token: string;

  constructor(
    private readonly baseUrl: string,
    private readonly userId: string,
    audience: string,
    secret: string,
  ) {
    this.token = createToken(userId, audience, secret);
  }

  private async request(method: string, path: string, body?: Json, raw?: Uint8Array): Promise<Response> {
    const headers: Record<string, string> = { Authorization: `Bearer ${this.token}` };
    let payload: BodyInit | undefined;
    if (raw) {
      headers["Content-Type"] = "application/octet-stream";
      payload = raw as unknown as BodyInit;
    } else if (body) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }
    const response = await fetch(`${this.baseUrl}${path}`, { method, headers, body: payload });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${method} ${path} -> HTTP ${response.status}: ${text.slice(0, 500)}`);
    }
    return response;
  }

  async getJson<T>(path: string): Promise<T> {
    const response = await this.request("GET", path);
    return (await response.json()) as T;
  }

  async postJson<T>(path: string, body: Json): Promise<T> {
    const response = await this.request("POST", path, body);
    return (await response.json()) as T;
  }

  async version(): Promise<Json> {
    return this.getJson<Json>("/v2/version");
  }

  async ledgerEnd(): Promise<number> {
    const data = await this.getJson<{ offset?: number }>("/v2/state/ledger-end");
    return data.offset ?? 0;
  }

  async packages(): Promise<string[]> {
    const data = await this.getJson<{ packageIds?: string[] }>("/v2/packages");
    return data.packageIds ?? [];
  }

  async primaryParty(): Promise<string> {
    const data = await this.getJson<{ user?: { primaryParty?: string } }>(
      `/v2/users/${encodeURIComponent(this.userId)}`,
    );
    const party = data.user?.primaryParty;
    if (!party) throw new Error(`El usuario ${this.userId} no tiene primaryParty todavia.`);
    return party;
  }

  async listParties(): Promise<PartyDetails[]> {
    const data = await this.getJson<{ partyDetails?: PartyDetails[] }>("/v2/parties");
    return data.partyDetails ?? [];
  }

  async allocateParty(hint: string): Promise<string> {
    const data = await this.postJson<{ partyDetails: PartyDetails }>("/v2/parties", { partyIdHint: hint });
    return data.partyDetails.party;
  }

  async listRights(): Promise<Json[]> {
    const data = await this.getJson<{ rights?: Json[] }>(
      `/v2/users/${encodeURIComponent(this.userId)}/rights`,
    );
    return data.rights ?? [];
  }

  async grantRights(rights: Json[]): Promise<void> {
    await this.postJson(`/v2/users/${encodeURIComponent(this.userId)}/rights`, {
      userId: this.userId,
      identityProviderId: "",
      rights,
    });
  }

  async activeContracts(party: string, templateId: string): Promise<ActiveContract[]> {
    const offset = await this.ledgerEnd();
    const body: Json = {
      eventFormat: {
        filtersByParty: {
          [party]: {
            cumulative: [{ identifierFilter: { TemplateFilter: { value: { templateId } } } }],
          },
        },
        verbose: false,
      },
      activeAtOffset: offset,
    };
    const entries = await this.postJson<Json[]>("/v2/state/active-contracts", body);
    const contracts: ActiveContract[] = [];
    for (const entry of entries) {
      const contractEntry = entry.contractEntry as Json | undefined;
      const active = contractEntry?.JsActiveContract as Json | undefined;
      const created = active?.createdEvent as Json | undefined;
      if (!created) continue;
      contracts.push({
        contractId: String(created.contractId),
        argument: (created.createArgument ?? {}) as Record<string, unknown>,
      });
    }
    return contracts;
  }

  async submit(commands: Json[], actAs: string[], readAs: string[] = actAs): Promise<SubmitResult> {
    const data = await this.postJson<{ transaction?: Json }>("/v2/commands/submit-and-wait-for-transaction", {
      commands,
      commandId: randomUUID(),
      actAs,
      readAs,
      userId: this.userId,
    });
    const transaction = (data.transaction ?? {}) as Json;
    return {
      updateId: transaction.updateId === undefined ? "" : String(transaction.updateId),
      offset: Number(transaction.offset ?? 0),
      transaction,
    };
  }

  async updateById(updateId: string, party: string): Promise<Json> {
    const body: Json = {
      updateId,
      updateFormat: {
        includeTransactions: {
          transactionShape: "TRANSACTION_SHAPE_ACS_DELTA",
          eventFormat: {
            filtersByParty: {
              [party]: {
                cumulative: [{ identifierFilter: { WildcardFilter: { value: {} } } }],
              },
            },
            verbose: true,
          },
        },
      },
    };
    return this.postJson<Json>("/v2/updates/update-by-id", body);
  }

  create(templateId: string, createArguments: Json): Json {
    return { CreateCommand: { templateId, createArguments } };
  }

  exercise(templateId: string, contractId: string, choice: string, choiceArgument: Json): Json {
    return { ExerciseCommand: { templateId, contractId, choice, choiceArgument } };
  }

  async uploadDar(bytes: Uint8Array): Promise<void> {
    await this.request("POST", "/v2/packages", undefined, bytes);
  }
}