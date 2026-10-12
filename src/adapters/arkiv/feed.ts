import { createPublicClient } from "@arkiv-network/sdk"
import { tiramisu } from "@arkiv-network/sdk/chains"
import { webSocket } from "viem"
import type { Address, Hex } from "../../domain/types"

export const TIRAMISU_WS = "wss://rpc.tiramisu.db-chain.testnet.arkiv.network"

/** A public client on a real WebSocket: `watchEntityEvents` then pushes instead of polling. */
export function createFeedClient(url: string = TIRAMISU_WS) {
  return createPublicClient({ chain: tiramisu, transport: webSocket(url) })
}

type EntityCreated = { entityKey: Hex; owner: Address; creationFlags?: { permissionlessExtension?: boolean } }
interface Watchable {
  watchEntityEvents(params: { onEntityCreated?: (e: EntityCreated) => void; onError?: (e: Error) => void }): () => void
}

/** UC-7: tells the UI the moment a trusted key raises an incident — no page reload, no polling loop. */
export class ArkivIncidentFeed {
  constructor(
    private readonly client: Watchable,
    private readonly lookup: (key: Hex) => Promise<{ type: string; creator: Address } | undefined>,
    private readonly onError: (e: Error) => void = () => {},
  ) {}

  subscribe(trusted: Address[], onIncident: (key: Hex) => void): () => void {
    const keys = new Set(trusted.map((a) => a.toLowerCase()))
    return this.client.watchEntityEvents({
      // no fromBlock: with a WebSocket transport this keeps a live subscription instead of polling
      onEntityCreated: (e) => {
        // at creation the owner is the signer, i.e. the creator; incidents are the only entities of the contract
        // created with permissionless extension — confirm with one lookup before alarming the user
        if (!keys.has(e.owner.toLowerCase())) return
        this.lookup(e.entityKey)
          .then((info) => {
            if (info && info.type === "incident" && keys.has(info.creator.toLowerCase())) onIncident(e.entityKey)
          })
          .catch((err: unknown) => this.onError(err instanceof Error ? err : new Error(String(err))))
      },
      onError: this.onError,
    })
  }
}

/**
 * `officially watch`: the team-side alarm that makes the 48-hour hold useful. Every entity a project key creates
 * is announced the moment it lands; an endpoint nobody on the team published means the publisher key is stolen —
 * rotate before the hold ends.
 */
export function watchKeys(
  client: Watchable,
  lookup: (key: Hex) => Promise<{ type: string; creator: Address } | undefined>,
  keys: Address[],
  onCreated: (e: { key: Hex; type: string; creator: Address }) => void,
  onError: (e: Error) => void = () => {},
): () => void {
  const set = new Set(keys.map((a) => a.toLowerCase()))
  return client.watchEntityEvents({
    onEntityCreated: (e) => {
      if (!set.has(e.owner.toLowerCase())) return
      lookup(e.entityKey)
        .then((info) => { if (info && set.has(info.creator.toLowerCase())) onCreated({ key: e.entityKey, type: info.type, creator: info.creator }) })
        .catch((err: unknown) => onError(err instanceof Error ? err : new Error(String(err))))
    },
    onError,
  })
}
