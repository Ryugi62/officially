import type { Address, Verdict } from "./types"

/** One anchor fetched from outside Arkiv. `text` is undefined when it could not be read. */
export interface AnchorDoc {
  source: string
  text: string | undefined
}

export interface AnchorEvidence {
  /** CONFIRMED: ≥1 anchor names the root and none names another. MISMATCH: an anchor names another key. ABSENT: nothing readable. */
  state: "CONFIRMED" | "MISMATCH" | "ABSENT"
  confirmedBy: string[]
  reasons: string[]
}

const HEX40 = /^0x[0-9a-fA-F]{40}$/

/** `officially.rootKey` of a well-known file. Anything else is not an anchor. */
export function parseAnchorDoc(text: string): Address | undefined {
  try {
    const k = (JSON.parse(text) as { officially?: { rootKey?: unknown } })?.officially?.rootKey
    return typeof k === "string" && HEX40.test(k) ? (k.toLowerCase() as Address) : undefined
  } catch {
    return undefined
  }
}

/** `github:owner/repo/path` → raw.githubusercontent.com (default branch main); https URLs pass; http is refused. */
export function anchorUrl(ref: string): string {
  const gh = /^github:([^/\s]+)\/([^/\s@]+)(?:@([^/\s]+))?\/(.+)$/.exec(ref)
  if (gh) return `https://raw.githubusercontent.com/${gh[1]}/${gh[2]}/${gh[3] ?? "main"}/${gh[4]}`
  if (!ref.startsWith("https://")) throw new Error(`Anchor must be https:// or github:owner/repo/path (got ${ref})`)
  return ref
}

export function evaluateAnchors(rootKey: Address, docs: AnchorDoc[]): AnchorEvidence {
  const root = rootKey.toLowerCase()
  const confirmedBy: string[] = []
  const reasons: string[] = []
  let mismatch = false
  for (const d of docs) {
    const stated = d.text === undefined ? undefined : parseAnchorDoc(d.text)
    if (stated === undefined) reasons.push(`anchor ${d.source}: unreadable or no root key stated`)
    else if (stated === root) confirmedBy.push(d.source)
    else {
      mismatch = true
      reasons.push(`anchor ${d.source} names root key ${stated}, not ${root}`)
    }
  }
  const state = mismatch ? "MISMATCH" : confirmedBy.length > 0 ? "CONFIRMED" : "ABSENT"
  if (docs.length === 0) reasons.push("no anchor given: the root key is only what you typed or pinned")
  return { state, confirmedBy, reasons }
}

/** Trust needs the key itself confirmed outside Arkiv: without it, OFFICIAL/PROBATION become UNVERIFIED_KEY. Worse verdicts stay. */
export function applyAnchor(v: Verdict, e: AnchorEvidence): Verdict {
  if (e.state === "CONFIRMED") {
    if (v.status !== "OFFICIAL" && v.status !== "PROBATION") return v
    return { ...v, reasons: [...v.reasons, ...e.confirmedBy.map((s) => `key confirmed by anchor: ${s}`)] }
  }
  if (v.status !== "OFFICIAL" && v.status !== "PROBATION") return v
  return { ...v, status: "UNVERIFIED_KEY", reasons: [...v.reasons, "root key NOT confirmed by an independent anchor — do not treat as official", ...e.reasons] }
}
