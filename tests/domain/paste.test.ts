// Unit 2: check-tx accepts the text block copied from a wallet confirmation window.
import { describe, expect, it } from "vitest"
import { parsePastedTx } from "../../src/domain/paste"

const TO = "0x5eedAAAAaaaaAAAAaaaaAAAAaaaaAAAAaaaaaaaa"
const DATA = "0x095ea7b3000000000000000000000000bad0000000000000000000000000000000000bad" + "f".repeat(64)

describe("parsePastedTx", () => {
  it("reads a labelled block: site, contract, chain, hex data", () => {
    const r = parsePastedTx(`Request from app.demo-swap.example\nInteracting with: ${TO}\nNetwork: Sepolia (chain id 11155111)\nHex data: ${DATA}\n`)
    expect(r).toMatchObject({ to: TO, data: DATA, chainId: 11155111, origin: "https://app.demo-swap.example" })
  })
  it("reads an eth_sendTransaction JSON object (chainId hex or decimal)", () => {
    const r = parsePastedTx(JSON.stringify({ from: "0x1111111111111111111111111111111111111111", to: TO, data: DATA, chainId: "0xaa36a7" }))
    expect(r).toMatchObject({ to: TO, data: DATA, chainId: 11155111 })
  })
  it("does not mistake the sender for the contract: 'to'/'interacting with'/'contract' win over 'from'", () => {
    const r = parsePastedTx(`From: 0x1111111111111111111111111111111111111111\nTo: ${TO}\nData: ${DATA}\nChain: 1`)
    expect(r.to).toBe(TO)
  })
  it("takes the first https URL as origin and keeps a bare host", () => {
    expect(parsePastedTx(`Site: https://App.Demo-Swap.example/swap?x=1\nTo: ${TO}\nData: ${DATA}\nChain: 1`).origin).toBe("https://app.demo-swap.example")
  })
  it("lists what is missing instead of guessing", () => {
    const r = parsePastedTx(`To: ${TO}\nChain: 1`)
    expect(r.data).toBeUndefined()
    expect(r.missing).toContain("data")
    expect(parsePastedTx("hello").missing).toEqual(expect.arrayContaining(["to", "data", "chain"]))
  })
  it("refuses two different contract addresses under 'to' labels (ambiguous)", () => {
    expect(() => parsePastedTx(`To: ${TO}\nContract: 0x2222222222222222222222222222222222222222\nData: ${DATA}\nChain: 1`)).toThrow(/ambiguous/i)
  })
})
