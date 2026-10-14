import { parsePastedTx, type PastedTx } from "../domain/paste"
import type { Pin } from "../domain/types"
import { checkTransaction, type TransactionVerdict } from "./check-transaction"
import type { AttestationReader } from "./ports"

export interface CheckPastedInput {
  /** what the wallet confirmation window shows, copied as text */
  text: string
  /** explicit values win over the text (CLI flags) */
  overrides?: { to?: string; data?: string; chainId?: number; origin?: string }
  pin?: Pin
}

export type CheckPastedResult =
  | { kind: "checked"; tv: TransactionVerdict; pasted: PastedTx }
  | { kind: "incomplete"; lack: ("to" | "data" | "chain")[]; pasted: PastedTx }

/** UC-10: the one function behind `check-tx --paste` and the web paste page. Never guesses a missing field. */
export async function checkPasted(reader: AttestationReader, input: CheckPastedInput): Promise<CheckPastedResult> {
  const pasted = parsePastedTx(input.text)
  const o = input.overrides ?? {}
  const to = o.to ?? pasted.to
  const data = o.data ?? pasted.data
  const chainId = o.chainId ?? pasted.chainId
  const origin = o.origin ?? pasted.origin
  const lack = ([!to && "to", !data && "data", chainId === undefined && "chain"] as const).filter((x): x is "to" | "data" | "chain" => !!x)
  if (lack.length) return { kind: "incomplete", lack, pasted }
  const tv = await checkTransaction(reader, { request: { to: to!, data: data!, chainId: chainId! }, ...(origin && { origin }), ...(input.pin && { pin: input.pin }) })
  return { kind: "checked", tv, pasted }
}
