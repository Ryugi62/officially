/** Text copied from a wallet confirmation window → the fields a transaction check needs. Pure; never guesses a missing field. */
export interface PastedTx {
  to?: string
  data?: string
  chainId?: number
  origin?: string
  /** fields (to · data · chain) the text did not contain */
  missing: string[]
}

const ADDR = /0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/
const TO_LABEL = /(?:^|[\n,{"'\s])(?:to|interacting with|contract(?: address)?|spender)["']?\s*[:=]\s*["']?(0x[0-9a-fA-F]{40})(?![0-9a-fA-F])/gi
const NAMED_CHAINS: Record<string, number> = { ethereum: 1, mainnet: 1, sepolia: 11155111, base: 8453, optimism: 10, arbitrum: 42161, polygon: 137 }

function chainOf(text: string): number | undefined {
  const m = /chain\s*(?:id)?["']?\s*[:=(]?\s*["']?(0x[0-9a-fA-F]+|\d+)/i.exec(text)
  if (m) return Number(m[1])
  const n = /network\s*[:=]\s*([a-z]+)/i.exec(text)
  return n ? NAMED_CHAINS[n[1]!.toLowerCase()] : undefined
}

function originOf(text: string): string | undefined {
  const u = /https:\/\/[^\s"'<>]+/i.exec(text)
  if (u) {
    try {
      return new URL(u[0]).origin
    } catch {
      /* fall through */
    }
  }
  const h = /(?:request from|site|origin|website)\s*[:=]?\s*([a-z0-9][a-z0-9.-]*\.[a-z]{2,})/i.exec(text)
  return h ? `https://${h[1]!.toLowerCase()}` : undefined
}

export function parsePastedTx(text: string): PastedTx {
  const tos = new Set([...text.matchAll(TO_LABEL)].map((m) => m[1]!.toLowerCase()))
  if (tos.size > 1) throw new Error("ambiguous: several different contract addresses under to/contract labels — paste one request")
  const to = tos.size ? [...text.matchAll(TO_LABEL)][0]![1] : undefined
  const loose = to ?? (new Set(text.match(new RegExp(ADDR, "g"))).size === 1 ? ADDR.exec(text)?.[0] : undefined)
  const hex = text.match(/0x(?:[0-9a-fA-F]{2}){4,}(?![0-9a-fA-F])/g)?.filter((h) => h.length !== 42).sort((a, b) => b.length - a.length)[0]
  const chainId = chainOf(text)
  const out: PastedTx = { missing: [] }
  if (loose) out.to = loose
  if (hex) out.data = hex
  if (chainId !== undefined && Number.isFinite(chainId)) out.chainId = chainId
  const origin = originOf(text)
  if (origin) out.origin = origin
  if (!out.to) out.missing.push("to")
  if (!out.data) out.missing.push("data")
  if (out.chainId === undefined) out.missing.push("chain")
  return out
}
