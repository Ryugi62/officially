import { evaluateAnchors, type AnchorEvidence } from "../domain/anchor"
import type { Address } from "../domain/types"

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
