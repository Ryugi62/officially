/** Minimal encoder for the demo dApp's approve(spender, amount) request — the guard decodes it like any wallet request. */
export function approveCalldata(spender: string, amount: bigint = 2n ** 256n - 1n): string {
  const addr = spender.toLowerCase().replace(/^0x/, "").padStart(64, "0")
  return "0x095ea7b3" + addr + amount.toString(16).padStart(64, "0")
}
