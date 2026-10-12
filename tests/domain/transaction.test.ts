// AC-18 decode the addresses a wallet request would authorize
import { describe, expect, it } from "vitest"
import { encodeFunctionData, parseAbi } from "viem"
import { decodeAuthorizations, isUndecoded } from "../../src/domain/transaction"

const TOKEN = "0x00000000000000000000000000000000000000aa"
const SPENDER = "0x00000000000000000000000000000000000000bb"
const abi = parseAbi([
  "function approve(address spender, uint256 amount)",
  "function increaseAllowance(address spender, uint256 added)",
  "function setApprovalForAll(address operator, bool approved)",
  "function transfer(address to, uint256 amount)",
])
const permit2 = parseAbi(["function approve(address token, address spender, uint160 amount, uint48 expiration)"])

describe("decodeAuthorizations (AC-18)", () => {
  it("ERC-20 approve → token contract + spender", () => {
    const data = encodeFunctionData({ abi, functionName: "approve", args: [SPENDER, 10n ** 30n] })
    expect(decodeAuthorizations({ to: TOKEN, data, chainId: 1 })).toEqual([
      { role: "contract", target: `eip155:1:${TOKEN}` },
      { role: "spender", target: `eip155:1:${SPENDER}` },
    ])
  })
  it("increaseAllowance → spender", () => {
    const data = encodeFunctionData({ abi, functionName: "increaseAllowance", args: [SPENDER, 1n] })
    expect(decodeAuthorizations({ to: TOKEN, data, chainId: 10 }).map((a) => a.role)).toEqual(["contract", "spender"])
  })
  it("setApprovalForAll → operator", () => {
    const data = encodeFunctionData({ abi, functionName: "setApprovalForAll", args: [SPENDER, true] })
    expect(decodeAuthorizations({ to: TOKEN, data, chainId: 1 })[1]).toEqual({ role: "operator", target: `eip155:1:${SPENDER}` })
  })
  it("setApprovalForAll(false) is a revocation: only the contract is checked", () => {
    const data = encodeFunctionData({ abi, functionName: "setApprovalForAll", args: [SPENDER, false] })
    expect(decodeAuthorizations({ to: TOKEN, data, chainId: 1 })).toHaveLength(1)
  })
  it("Permit2 approve → token + spender, with Permit2 as the contract", () => {
    const P2 = "0x000000000022d473030f116ddee9f6b43ac78ba3"
    const data = encodeFunctionData({ abi: permit2, functionName: "approve", args: [TOKEN, SPENDER, 5n, 0] })
    expect(decodeAuthorizations({ to: P2, data, chainId: 1 })).toEqual([
      { role: "contract", target: `eip155:1:${P2}` },
      { role: "token", target: `eip155:1:${TOKEN}` },
      { role: "spender", target: `eip155:1:${SPENDER}` },
    ])
  })
  it("EIP-2612 permit typed data → verifying contract + spender", () => {
    const typed = {
      domain: { name: "Demo", version: "1", chainId: 1, verifyingContract: TOKEN },
      primaryType: "Permit",
      types: { Permit: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }] },
      message: { owner: "0x00000000000000000000000000000000000000cc", spender: SPENDER, value: "1" },
    }
    expect(decodeAuthorizations({ typedData: typed })).toEqual([
      { role: "contract", target: `eip155:1:${TOKEN}` },
      { role: "spender", target: `eip155:1:${SPENDER}` },
    ])
  })
  it("unknown calldata → only the called contract", () => {
    const data = encodeFunctionData({ abi, functionName: "transfer", args: [SPENDER, 1n] })
    expect(decodeAuthorizations({ to: TOKEN, data, chainId: 1 })).toEqual([{ role: "contract", target: `eip155:1:${TOKEN}` }])
  })
  it("rejects truncated calldata for a known selector instead of guessing", () => {
    expect(() => decodeAuthorizations({ to: TOKEN, data: "0x095ea7b3" + "00".repeat(10), chainId: 1 })).toThrow()
  })
})

describe("typed data allowlist (mock-judge round 2)", () => {
  const base = { domain: { name: "X", version: "1", chainId: 1, verifyingContract: TOKEN } }
  it("only EIP-2612 Permit and Permit2 PermitSingle are decoded; anything else is undecoded", () => {
    expect(isUndecoded({ typedData: { ...base, primaryType: "Permit", message: { spender: SPENDER } } })).toBe(false)
    expect(isUndecoded({ typedData: { ...base, primaryType: "PermitSingle", message: { spender: SPENDER, details: { token: TOKEN } } } })).toBe(false)
    expect(isUndecoded({ typedData: { ...base, primaryType: "OrderComponents", message: { offerer: SPENDER } } })).toBe(true) // Seaport
    expect(isUndecoded({ typedData: { ...base, primaryType: "PermitBatch", message: { spender: SPENDER, details: [{ token: TOKEN }] } } })).toBe(true)
    expect(isUndecoded({ typedData: { ...base, message: { spender: SPENDER } } })).toBe(true) // no primaryType
  })
  it("a Seaport order still checks its verifying contract but is never a clean pass", () => {
    const a = decodeAuthorizations({ typedData: { ...base, primaryType: "OrderComponents", message: { offerer: SPENDER } } })
    expect(a).toEqual([{ role: "contract", target: `eip155:1:${TOKEN}` }])
  })
})
