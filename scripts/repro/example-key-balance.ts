// Repro: the SDK README offers a shared example private key for the write tutorial; check whether it can pay for a write.
import { createPublicClient } from "@arkiv-network/sdk"
import { tiramisu } from "@arkiv-network/sdk/chains"
import { formatEther, http } from "viem"
import { privateKeyToAccount } from "viem/accounts"

const README_KEY = "0x3d05798f7d11bb1c10b83fed8d3b4d76570c31cd66c8e0a8d8d991434c6d7a5e" // published in @arkiv-network/sdk README
const client = createPublicClient({ chain: tiramisu, transport: http(undefined, { retryCount: 0 }) })
const address = privateKeyToAccount(README_KEY).address
console.log("address", address, "balance GLM", formatEther(await client.getBalance({ address })), "at block", await client.getBlockNumber())
