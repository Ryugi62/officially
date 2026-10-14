import type { Anchor, ProjectRecord } from "./types"
import { anchorUrl } from "./anchor"

/** Where an anchor reference came from decides whether it may confirm a root key. */
export interface AnchorSelectionInput {
  /** "pinned": the user typed or stored the root key before looking at the page. "page": a link, query string or page content supplied it. */
  rootFrom: "pinned" | "page"
  /** project records found for the root key (their `creator` is the root: only that key can sign them) */
  records: ProjectRecord[]
  /** anchor URLs the user pinned earlier (their own storage) */
  pinned: string[]
  /** anchor URLs given in this call (CLI flag): kept only when the record lists them too */
  supplied: string[]
  /** anchor URLs a page or a link offered: never used */
  fromPage: string[]
}

export interface AnchorSelection {
  refs: string[]
  ignored: { ref: string; reason: string }[]
}

/** The location to fetch for an anchor stored in a project record (GitHub blob link, github: ref, ens:, https). */
export function recordAnchorUrl(a: Anchor): string | undefined {
  const blob = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/.exec(a.ref)
  try {
    if (blob) return `https://raw.githubusercontent.com/${blob[1]}/${blob[2]}/${blob[3]}/${blob[4]}`
    return anchorUrl(a.ref)
  } catch {
    return undefined
  }
}

/**
 * The anchor list that may confirm a root key. Sources:
 * 1. the `anchors` field of a project record signed by the root key (only when the user, not a page, chose that root);
 * 2. anchors the user pinned earlier.
 * Anything a page or link offered, and any typed anchor the record does not list, is dropped and reported.
 */
export function selectAnchors(i: AnchorSelectionInput): AnchorSelection {
  const ignored: AnchorSelection["ignored"] = []
  const pinned = i.pinned.map((s) => s.trim())
  const fromRecord = i.rootFrom === "pinned" ? i.records.flatMap((r) => r.anchors.map(recordAnchorUrl).filter((u): u is string => !!u)) : []
  if (i.rootFrom === "page" && i.records.some((r) => r.anchors.length))
    ignored.push({ ref: "(project record)", reason: "the root key came from a page or link, so the anchors in the record it signed prove nothing" })
  const known = new Set([...fromRecord, ...pinned])
  for (const p of i.fromPage.map((s) => s.trim())) if (!known.has(p)) ignored.push({ ref: p, reason: "offered by a page or link: anchors are never learned from the page" })
  for (const s of i.supplied.map((x) => x.trim())) if (!known.has(s)) ignored.push({ ref: s, reason: "not listed in the project record signed by the root key and not pinned earlier" })
  return { refs: [...known], ignored }
}
