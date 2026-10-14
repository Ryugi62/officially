import { evaluateAnchors, type AnchorEvidence } from "../domain/anchor"
import { selectAnchors } from "../domain/anchor-sources"
import type { Address } from "../domain/types"
import type { AttestationReader } from "./ports"

/** Port: read a small public text file over HTTPS (GitHub raw, a project's well-known path). */
export interface AnchorFetcher {
  fetchText(url: string): Promise<string | undefined>
}

/** Does any place outside Arkiv state this root key? Network failures read as "absent", never as "confirmed". */
export async function confirmRootKey(fetcher: AnchorFetcher, rootKey: Address, urls: string[]): Promise<AnchorEvidence> {
  const docs = await Promise.all(
    [...new Set(urls)].map(async (source) => ({ source, text: await fetcher.fetchText(source).catch(() => undefined) })),
  )
  return evaluateAnchors(rootKey, docs)
}

import { applyAnchor } from "../domain/anchor"
import { worst } from "./assess"
import type { TransactionVerdict } from "./check-transaction"

/** Apply the anchor result to every part of a transaction check; the combined verdict is the worst part again. */
export function anchorGateTransaction(tv: TransactionVerdict, e: AnchorEvidence): TransactionVerdict {
  const parts = tv.parts.map((p) => ({ ...p, verdict: applyAnchor(p.verdict, e) }))
  return { ...tv, parts, verdict: worst(parts.map((p) => p.verdict)) }
}

/**
 * Anchor evidence for a root key, with the anchor list taken from the root-signed project record (or earlier pins), never from a page.
 * Returns undefined only when there is nothing to check (no record anchor, nothing offered): the answer is then pin-only.
 */
export async function anchorEvidenceFor(
  fetcher: AnchorFetcher,
  reader: AttestationReader,
  rootKey: Address,
  opts: { rootFrom: "pinned" | "page"; pinned?: string[]; supplied?: string[]; fromPage?: string[] },
): Promise<AnchorEvidence | undefined> {
  const records = await reader.findProjectRecords(rootKey)
  const sel = selectAnchors({ rootFrom: opts.rootFrom, records, pinned: opts.pinned ?? [], supplied: opts.supplied ?? [], fromPage: opts.fromPage ?? [] })
  if (sel.refs.length === 0 && sel.ignored.length === 0) return undefined
  const ev = await confirmRootKey(fetcher, rootKey, sel.refs)
  return { ...ev, reasons: [...ev.reasons, ...sel.ignored.map((i) => `anchor ignored ${i.ref}: ${i.reason}`)] }
}
