/**
 * Which addresses would a wallet request authorize? Pure hex/JSON parsing — no ABI library, no I/O.
 * Known approval shapes are decoded; anything else checks only the called contract.
 */
export type AuthorizationRole = "contract" | "token" | "spender" | "operator"
export interface Authorization {
  role: AuthorizationRole
  target: string
}

export interface TxRequest {
  to: string
  data?: string
  chainId: number
}
export interface TypedDataRequest {
  typedData: {
    domain?: { chainId?: number | string; verifyingContract?: string }
    primaryType?: string
    message?: Record<string, unknown>
  }
}

export class UndecodableRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "UndecodableRequestError"
  }
}

const SELECTORS = {
  "0x095ea7b3": { name: "approve", args: ["spender"] as const }, // approve(address,uint256)
  "0x39509351": { name: "increaseAllowance", args: ["spender"] as const }, // increaseAllowance(address,uint256)
  "0xa22cb465": { name: "setApprovalForAll", args: ["operator"] as const }, // setApprovalForAll(address,bool)
  "0x87517c45": { name: "permit2.approve", args: ["token", "spender"] as const }, // approve(address,address,uint160,uint48)
} as const
const MIN_WORDS: Record<keyof typeof SELECTORS, number> = { "0x095ea7b3": 2, "0x39509351": 2, "0xa22cb465": 2, "0x87517c45": 4 }

const ADDR = /^0x[0-9a-fA-F]{40}$/
const caip = (chainId: number, address: string) => `eip155:${chainId}:${address.toLowerCase()}`

function word(data: string, i: number): string {
  return data.slice(10 + i * 64, 10 + (i + 1) * 64)
}
function addressWord(w: string): string {
  if (!/^0{24}[0-9a-fA-F]{40}$/.test(w)) throw new UndecodableRequestError("Malformed address argument")
  return "0x" + w.slice(24)
}

export function decodeAuthorizations(req: TxRequest | TypedDataRequest): Authorization[] {
  if ("typedData" in req) return decodeTypedData(req)
  if (!ADDR.test(req.to)) throw new UndecodableRequestError("`to` is not an address")
  const out: Authorization[] = [{ role: "contract", target: caip(req.chainId, req.to) }]
  const data = (req.data ?? "0x").toLowerCase()
  const selector = data.slice(0, 10) as keyof typeof SELECTORS
  const known = SELECTORS[selector]
  if (!known) return out
  if (data.length < 10 + MIN_WORDS[selector] * 64) throw new UndecodableRequestError(`Truncated calldata for ${known.name}`)
  if (selector === "0xa22cb465") {
    const approved = BigInt("0x" + word(data, 1)) !== 0n
    if (!approved) return out // revoking an operator authorizes nobody
  }
  known.args.forEach((role, i) => out.push({ role, target: caip(req.chainId, addressWord(word(data, i))) }))
  return out
}

function decodeTypedData(req: TypedDataRequest): Authorization[] {
  const { domain, message } = req.typedData
  const chainId = Number(domain?.chainId)
  if (!Number.isInteger(chainId) || chainId <= 0) throw new UndecodableRequestError("Typed data without a chain id")
  const out: Authorization[] = []
  if (domain?.verifyingContract && ADDR.test(domain.verifyingContract)) {
    out.push({ role: "contract", target: caip(chainId, domain.verifyingContract) })
  }
  const spender = message?.spender
  if (typeof spender === "string" && ADDR.test(spender)) out.push({ role: "spender", target: caip(chainId, spender) })
  const details = message?.details as Record<string, unknown> | undefined // Permit2 PermitSingle
  if (details && typeof details.token === "string" && ADDR.test(details.token)) out.push({ role: "token", target: caip(chainId, details.token) })
  if (out.length === 0) throw new UndecodableRequestError("Typed data names no contract or spender")
  return out
}
