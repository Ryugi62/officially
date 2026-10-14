// Web paste page == CLI `check-tx --paste`: both call checkPasted, so the same wallet-window text gives the same verdict.
import { beforeEach, describe, expect, it } from "vitest"
import { encodeFunctionData, parseAbi } from "viem"
import { checkPasted } from "../../src/application/check-pasted"
import { checkTransaction } from "../../src/application/check-transaction"
import { parsePastedTx } from "../../src/domain/paste"
import { hashTarget } from "../../src/domain/hash"
import { normalizeTarget } from "../../src/domain/target"
import { claim, PUB_A, record, ROOT } from "../fixtures"
import { FakeReader } from "./fakes"

const ORIGIN = "https://app.demo-swap.example"
const TOKEN = "0x00000000000000000000000000000000000000aa"
const ROUTER = "0x00000000000000000000000000000000000000a1"
const DRAINER = "0x00000000000000000000000000000000000000d0"
const h = (raw: string) => hashTarget(normalizeTarget(raw, { chainId: 1 }))
const approve = (s: string) => encodeFunctionData({ abi: parseAbi(["function approve(address,uint256)"]), functionName: "approve", args: [s as `0x${string}`, 2n ** 255n] })
const fixture = () => new FakeReader([record({ publisher: PUB_A })], [h(ORIGIN), h(`eip155:1:${TOKEN}`), h(`eip155:1:${ROUTER}`)].map((targetHash) => claim({ targetHash, creator: PUB_A, createdAtBlock: 1n })), [], 200_000n)
const window = (spender: string) => `Request from app.demo-swap.example\nInteracting with: ${TOKEN}\nNetwork: Ethereum (chain id 1)\nHex data: ${approve(spender)}\n`

let shared = fixture()
const reader = () => shared
beforeEach(() => { shared = fixture() })

describe("checkPasted", () => {
  it("official spender: OFFICIAL, same as parse + checkTransaction (the CLI's old path)", async () => {
    const text = window(ROUTER)
    const p = parsePastedTx(text)
    const old = await checkTransaction(reader(), { request: { to: p.to!, data: p.data!, chainId: p.chainId! }, origin: p.origin!, pin: { rootKey: ROOT } })
    const r = await checkPasted(reader(), { text, pin: { rootKey: ROOT } })
    expect(r.kind).toBe("checked")
    if (r.kind === "checked") {
      expect(r.tv).toEqual(old)
      expect(r.tv.verdict.status).toBe("OFFICIAL")
    }
  })
  it("unpublished spender is not OFFICIAL, and the web and CLI callers see the identical object", async () => {
    const text = window(DRAINER)
    const cli = await checkPasted(reader(), { text, pin: { rootKey: ROOT } })
    const web = await checkPasted(reader(), { text, pin: { rootKey: ROOT } })
    expect(cli).toEqual(web)
    expect(cli.kind === "checked" && cli.tv.verdict.status).not.toBe("OFFICIAL")
  })
  it("flags override what the text says (CLI --to/--data/--chain/--origin)", async () => {
    const r = await checkPasted(reader(), { text: window(DRAINER), overrides: { data: approve(ROUTER) }, pin: { rootKey: ROOT } })
    expect(r.kind === "checked" && r.tv.verdict.status).toBe("OFFICIAL")
  })
  it("a missing field is reported, never guessed, and nothing is read", async () => {
    const rd = reader()
    rd.calls.length = 0
    const r = await checkPasted(rd, { text: `To: ${TOKEN}\nChain: 1`, pin: { rootKey: ROOT } })
    expect(r).toMatchObject({ kind: "incomplete", lack: ["data"] })
    expect(rd.calls).toEqual([])
  })
  it("an ambiguous paste throws instead of picking one contract", async () => {
    await expect(checkPasted(reader(), { text: `To: ${TOKEN}\nTo: ${ROUTER}\nData: 0x095ea7b3aa\nChain: 1`, pin: { rootKey: ROOT } })).rejects.toThrow(/ambiguous/)
  })
})
