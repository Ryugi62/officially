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
  rootKey: "0x70E5d4986A251a5173Acf59c86178e144B62864E",
  publisher: "0x7169173d0D00db282f385FEE8BeCe2D67d10c6f0", // publisher-v2 since the 12 Oct rotation (retired: 0x04a16DA7180594eF2dFFcF70431e809432CE438F)
  origin: "https://app.demo-swap.example",
  chainId: 11155111,
  token: "0x5eed00000000000000000000000000000000aaaa",
  router: "0x5eed00000000000000000000000000000000a11c",
  drainer: "0xbad0000000000000000000000000000000000bad",
  seededAtBlock: "0",
}
