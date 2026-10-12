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
