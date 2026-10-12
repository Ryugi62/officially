// Can a stranger silence a warning by "extending" it to an EARLIER expiry? (permissionlessExtension is on)
import { createPublicClient, createWalletClient, ExpirationTime } from "@arkiv-network/sdk"
import { tiramisu } from "@arkiv-network/sdk/chains"
import { http } from "viem"
import { privateKeyToAccount } from "viem/accounts"
const key = process.argv[2] as `0x${string}`
const transport = http(undefined, { retryCount: 0 })
const pub = createPublicClient({ chain: tiramisu, transport })
const w = createWalletClient({ chain: tiramisu, transport, account: privateKeyToAccount(process.env.STRANGER_KEY as `0x${string}`) })
const before = await pub.getEntity(key)
console.log("incident", key.slice(0, 10), "owner", before.owner, "expiresAt", before.expiresAt, "block", await pub.getBlockNumber(), "stranger", w.account.address)
try {
  const r = await w.extendEntity({ entityKey: key, expires: ExpirationTime.fromHours(1) })
  console.log("ACCEPTED (warning shortened?)", r.txHash, "new expiresAt", r.expiresAt)
} catch (e) {
  console.log("REJECTED:", (e as Error).message.split("\n")[0])
}
console.log("expiresAt after", (await pub.getEntity(key)).expiresAt)
