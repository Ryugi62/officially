// Repro: can one funded testnet wallet send GLM to another? (Docs: only transactions to Arkiv operation addresses are accepted.)
import { createPublicClient, createWalletClient, http, parseEther, formatEther } from "viem"
import { tiramisu } from "@arkiv-network/sdk/chains"
import { privateKeyToAccount } from "viem/accounts"
const account = privateKeyToAccount(process.env.FROM_KEY as `0x${string}`)
const to = process.argv[2] as `0x${string}`
const pub = createPublicClient({ chain: tiramisu, transport: http(undefined, { retryCount: 0 }) })
const w = createWalletClient({ chain: tiramisu, transport: http(undefined, { retryCount: 0 }), account })
const before = await pub.getBalance({ address: to })
try {
  const hash = await w.sendTransaction({ to, value: parseEther(process.env.AMOUNT ?? "0.01") })
  const r = await pub.waitForTransactionReceipt({ hash })
  console.log("tx", hash, "status", r.status)
} catch (e) {
  console.log((e as Error).name + ":", (e as Error).message.split("\n").slice(0, 3).join(" | "))
}
console.log("recipient balance", formatEther(before), "->", formatEther(await pub.getBalance({ address: to })))
