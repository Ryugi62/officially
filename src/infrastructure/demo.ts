import type { Address } from "../domain/types"

/**
 * The synthetic demo project. Everything here is made up and uses the reserved `.example` TLD and
 * Sepolia-style chain id 11155111 identifiers — no real project is signed by our keys.
 * Addresses are filled in by `scripts/seed.ts` after it writes the demo entities on Tiramisu.
 */
export interface DemoConfig {
  name: string
  slug: string
  rootKey: Address
  publisher: Address
  origin: string
  chainId: number
  token: Address
  router: Address
  drainer: Address
  seededAtBlock: string
}

export const DEMO: DemoConfig = {
  name: "Demo Swap (synthetic)",
  slug: "demo-swap",
  rootKey: "0x0000000000000000000000000000000000000000",
  publisher: "0x0000000000000000000000000000000000000000",
  origin: "https://app.demo-swap.example",
  chainId: 11155111,
  token: "0x5eed00000000000000000000000000000000aaaa",
  router: "0x5eed00000000000000000000000000000000a11c",
  drainer: "0xbad0000000000000000000000000000000000bad",
  seededAtBlock: "0",
}
