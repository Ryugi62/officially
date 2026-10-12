import { normalizeTarget } from "../domain/target"
import { decodeAuthorizations, type TxRequest, type TypedDataRequest } from "../domain/transaction"
import type { Pin, Target, Verdict } from "../domain/types"
import { assessTargets, worst } from "./assess"
import type { AttestationReader } from "./ports"

export interface CheckTransactionInput {
  request: TxRequest | TypedDataRequest
  /** the site asking for the signature, if known */
  origin?: string
  pin?: Pin
}

export interface TransactionVerdict {
  verdict: Verdict
  parts: { role: "origin" | "contract" | "token" | "spender" | "operator"; target: string; verdict: Verdict }[]
}

/** UC-9: every address the request would authorize, plus the origin, checked in ≤ 3 reads; worst wins. */
export async function checkTransaction(reader: AttestationReader, input: CheckTransactionInput): Promise<TransactionVerdict> {
  const parts: { role: TransactionVerdict["parts"][number]["role"]; target: Target }[] = []
  if (input.origin) parts.push({ role: "origin", target: normalizeTarget(input.origin) })
  for (const a of decodeAuthorizations(input.request)) parts.push({ role: a.role, target: normalizeTarget(a.target) })
  const verdicts = await assessTargets(reader, parts.map((p) => p.target), input.pin)
  const out = parts.map((p, i) => ({ role: p.role, target: p.target.value, verdict: verdicts[i]! }))
  return { verdict: worst(out.map((p) => p.verdict)), parts: out }
}
