import type { TransactionVerdict } from "../../application/check-transaction"
import type { TxRequest, TypedDataRequest } from "../../domain/transaction"

export interface Eip1193 {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>
}

/** Thrown in place of the wallet's answer: EIP-1193 4001 means "the user rejected", which every dApp already handles. */
export class OfficiallyBlockedError extends Error {
  readonly code = 4001
  constructor(public readonly verdict: TransactionVerdict) {
    super(`Officially blocked this request: ${verdict.verdict.status}${verdict.undecoded ? " (arguments not decoded)" : ""} — ${verdict.verdict.reasons[0] ?? ""}`)
    this.name = "OfficiallyBlockedError"
  }
}

/**
 * Wraps a wallet's EIP-1193 provider so `eth_sendTransaction` and `eth_signTypedData_v4` are checked against the
 * project's published keys *before* the wallet ever shows them. Clean passes go through; anything else is refused
 * with code 4001 unless `confirm` (the user, shown the verdict) explicitly allows it.
 */
export function guardProvider(
  inner: Eip1193,
  opts: {
    origin: string
    check: (req: TxRequest | TypedDataRequest, origin: string) => Promise<TransactionVerdict>
    confirm?: (v: TransactionVerdict) => Promise<boolean>
    onVerdict?: (v: TransactionVerdict) => void
  },
): Eip1193 {
  const gate = async (req: TxRequest | TypedDataRequest) => {
    const v = await opts.check(req, opts.origin)
    opts.onVerdict?.(v)
    const clean = v.verdict.status === "OFFICIAL" && !v.undecoded
    if (!clean && !(await opts.confirm?.(v))) throw new OfficiallyBlockedError(v)
  }
  return {
    async request(args) {
      if (args.method === "eth_sendTransaction") {
        const tx = (args.params?.[0] ?? {}) as { to?: string; data?: string; chainId?: string | number }
        const chainId = Number(tx.chainId ?? (await inner.request({ method: "eth_chainId" })))
        await gate({ to: String(tx.to ?? ""), ...(tx.data && { data: tx.data }), chainId })
      } else if (args.method === "eth_signTypedData_v4" || args.method === "eth_signTypedData") {
        const raw = args.params?.[1]
        const typedData = typeof raw === "string" ? JSON.parse(raw) : raw
        await gate({ typedData })
      }
      return inner.request(args)
    },
  }
}
