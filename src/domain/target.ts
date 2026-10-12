import type { Target } from "./types"

export class InvalidTargetError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "InvalidTargetError"
  }
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/
const CAIP10 = /^eip155:(\d{1,12}):(0x[0-9a-fA-F]{40})$/
const HANDLE = /^@?([A-Za-z0-9_]{1,15})$/
const SCHEME = /^([a-zA-Z][a-zA-Z0-9+.-]*):/
const X_HOSTS = new Set(["x.com", "www.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com", "mobile.x.com"])
const X_RESERVED = new Set(["home", "i", "intent", "search", "explore", "settings", "share", "hashtag"])

/**
 * Turns what a user pastes into the one canonical string that is hashed and published.
 * Web: origin only (scheme + punycode host + non-default port). Contract: CAIP-10. Social: x:@handle.
 */
export function normalizeTarget(raw: string, opts: { chainId?: number } = {}): Target {
  const input = raw.trim()
  if (input === "") throw new InvalidTargetError("Empty target")

  const caip = input.match(CAIP10)
  if (caip) return { kind: "contract", value: `eip155:${Number(caip[1])}:${caip[2]!.toLowerCase()}` }

  if (ADDRESS.test(input)) {
    if (opts.chainId === undefined || !Number.isInteger(opts.chainId) || opts.chainId <= 0) {
      throw new InvalidTargetError("A bare address needs a chain id (or paste eip155:<chainId>:<address>)")
    }
    return { kind: "contract", value: `eip155:${opts.chainId}:${input.toLowerCase()}` }
  }

  if (input.startsWith("@")) {
    const m = input.match(HANDLE)
    if (!m) throw new InvalidTargetError(`Not an X handle: ${input}`)
    return { kind: "social", value: `x:@${m[1]!.toLowerCase()}` }
  }

  const scheme = input.match(SCHEME)?.[1]?.toLowerCase()
  const withScheme = scheme && (scheme === "http" || scheme === "https") ? input : scheme ? null : `https://${input}`
  if (withScheme === null) throw new InvalidTargetError(`Only http(s) links are supported, got ${scheme}:`)

  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    throw new InvalidTargetError(`Not a link: ${input}`)
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new InvalidTargetError("Only http(s) links are supported")
  if (!url.hostname.includes(".")) throw new InvalidTargetError(`Not a public host: ${url.hostname}`)

  if (X_HOSTS.has(url.hostname)) {
    const first = url.pathname.split("/").filter(Boolean)[0]
    if (first && !X_RESERVED.has(first.toLowerCase())) {
      const m = first.match(HANDLE)
      if (m) return { kind: "social", value: `x:@${m[1]!.toLowerCase()}` }
    }
  }
  return { kind: "web", value: url.origin }
}
