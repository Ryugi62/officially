import { keccak_256 } from "@noble/hashes/sha3"
import { bytesToHex } from "@noble/hashes/utils"
import type { Hex, Target } from "./types"

/** Target hash used for incidents that cover a whole project rather than one endpoint. */
export const PROJECT_WIDE = ("0x" + "0".repeat(64)) as Hex

/** keccak256(utf8(normalized target)) — the value stored in the `target_hash` bytes32 attribute. */
export function hashTarget(target: Target | string): Hex {
  const value = typeof target === "string" ? target : target.value
  return ("0x" + bytesToHex(keccak_256(new TextEncoder().encode(value)))) as Hex
}
