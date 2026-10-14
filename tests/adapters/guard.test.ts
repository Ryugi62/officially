// The signing-moment path: requests are checked before they reach the wallet.
import { describe, expect, it } from "vitest"
import { guardProvider, OfficiallyBlockedError } from "../../src/adapters/wallet/guard"
import { checkTransaction } from "../../src/application/check-transaction"
import { hashTarget } from "../../src/domain/hash"
import { normalizeTarget } from "../../src/domain/target"
import { claim, EVIL, PUB_A, record, ROOT } from "../fixtures"
import { FakeReader } from "../application/fakes"

const ORIGIN = "https://app.demo-swap.example", TOKEN = "0x00000000000000000000000000000000000000aa", ROUTER = "0x00000000000000000000000000000000000000a1", DRAINER = "0x00000000000000000000000000000000000000d0"
const h = (raw: string) => hashTarget(normalizeTarget(raw, { chainId: 1 }))
const reader = () => new FakeReader([record({ publisher: PUB_A })], [
  claim({ targetHash: h(ORIGIN), creator: PUB_A }), claim({ targetHash: h(`eip155:1:${TOKEN}`), creator: PUB_A }), claim({ targetHash: h(`eip155:1:${ROUTER}`), creator: PUB_A }),
  claim({ targetHash: h(`eip155:1:${DRAINER}`), creator: EVIL }),
], [], 200_000n)
const approve = (s: string) => "0x095ea7b3" + s.slice(2).padStart(64, "0") + "f".repeat(64)
function wallet() {
  const seen: string[] = []
  return { seen, provider: { async request({ method }: { method: string; params?: unknown[] }) { seen.push(method); return method === "eth_chainId" ? "0x1" : "0xsigned" } } }
}

describe("guardProvider (EIP-1193)", () => {
  const mk = (w: ReturnType<typeof wallet>) => guardProvider(w.provider, { origin: ORIGIN, check: (req, origin) => checkTransaction(reader(), { request: req, origin, pin: { rootKey: ROOT } }) })
  it("passes a request whose every address was published by the project's keys", async () => {
    const w = wallet()
    await expect(mk(w).request({ method: "eth_sendTransaction", params: [{ to: TOKEN, data: approve(ROUTER) }] })).resolves.toBe("0xsigned")
    expect(w.seen).toContain("eth_sendTransaction")
  })
  it("blocks the hijacked approve before it reaches the wallet, with EIP-1193 code 4001", async () => {
    const w = wallet()
    const p = mk(w).request({ method: "eth_sendTransaction", params: [{ to: TOKEN, data: approve(DRAINER) }] })
    await expect(p).rejects.toBeInstanceOf(OfficiallyBlockedError)
    await expect(p).rejects.toMatchObject({ code: 4001 })
    expect(w.seen).not.toContain("eth_sendTransaction")
  })
  it("blocks typed data it cannot decode (e.g. a Seaport order) unless the user overrides", async () => {
    const typed = JSON.stringify({ domain: { chainId: 1, verifyingContract: TOKEN }, primaryType: "OrderComponents", message: {} })
    const w = wallet()
    await expect(mk(w).request({ method: "eth_signTypedData_v4", params: ["0xme", typed] })).rejects.toBeInstanceOf(OfficiallyBlockedError)
    const w2 = wallet()
    const g = guardProvider(w2.provider, { origin: ORIGIN, check: (req, origin) => checkTransaction(reader(), { request: req, origin, pin: { rootKey: ROOT } }), confirm: async () => true })
    await expect(g.request({ method: "eth_signTypedData_v4", params: ["0xme", typed] })).resolves.toBe("0xsigned")
  })
  it("leaves every other method untouched", async () => {
    const w = wallet()
    await expect(mk(w).request({ method: "eth_chainId" })).resolves.toBe("0x1")
  })
  it("never passes a clean verdict that came from the offline snapshot, even if every address matches", async () => {
    const w = wallet()
    const g = guardProvider(w.provider, { origin: ORIGIN, isLive: () => false, check: (req, origin) => checkTransaction(reader(), { request: req, origin, pin: { rootKey: ROOT } }) })
    await expect(g.request({ method: "eth_sendTransaction", params: [{ to: TOKEN, data: approve(ROUTER) }] })).rejects.toMatchObject({ code: 4001 })
    expect(w.seen).not.toContain("eth_sendTransaction")
  })
})
