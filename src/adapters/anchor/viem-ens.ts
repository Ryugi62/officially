import { createPublicClient, http } from "viem"
import { sepolia } from "viem/chains"
import type { EnsTextResolver } from "./ens-fetcher"

/** Reads ENS text records on Sepolia (testnet; the entry never touches mainnet). OFFICIALLY_ENS_RPC overrides the RPC. */
export function viemEnsResolver(rpc = process.env.OFFICIALLY_ENS_RPC): EnsTextResolver {
  const client = createPublicClient({ chain: sepolia, transport: http(rpc, { retryCount: 0, timeout: 10_000 }) })
  return { text: (name, key) => client.getEnsText({ name, key }) }
}
