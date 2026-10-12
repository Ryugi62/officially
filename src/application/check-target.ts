import { normalizeTarget } from "../domain/target"
import type { Pin, Verdict } from "../domain/types"
import { assessTargets } from "./assess"
import type { AttestationReader } from "./ports"

export interface CheckTargetInput {
  raw: string
  chainId?: number
  pin?: Pin
}

/** UC-1: one target, ≤ 3 reads. */
export async function checkTarget(reader: AttestationReader, input: CheckTargetInput): Promise<Verdict> {
  const target = normalizeTarget(input.raw, input.chainId === undefined ? {} : { chainId: input.chainId })
  const [v] = await assessTargets(reader, [target], input.pin)
  return v!
}
