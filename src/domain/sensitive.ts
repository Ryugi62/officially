export class SensitiveDataError extends Error {
  constructor(public readonly findings: string[]) {
    super(`Refusing to write sensitive-looking data: ${findings.join(", ")}`)
    this.name = "SensitiveDataError"
  }
}

const PRIVATE_KEY = /\b(0x)?[0-9a-fA-F]{64}\b/
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/
const PHONE = /(\+\d{1,3}[\s-]?)?(\(?\d{2,4}\)?[\s-]?)\d{3,4}[\s-]?\d{4}\b/
const MNEMONIC = /\b([a-z]{3,8}\s+){11,23}[a-z]{3,8}\b/

/** Scans free text that a writer is about to put on a public chain. Hashes are allowed only where the code puts them (target_hash). */
export function findSensitive(text: string): string[] {
  const out: string[] = []
  if (PRIVATE_KEY.test(text)) out.push("private-key-shaped hex")
  if (EMAIL.test(text)) out.push("email address")
  if (PHONE.test(text)) out.push("phone number")
  if (MNEMONIC.test(text)) out.push("seed-phrase-shaped words")
  return out
}

export function assertNoSensitive(values: string[]): void {
  const findings = [...new Set(values.flatMap(findSensitive))]
  if (findings.length) throw new SensitiveDataError(findings)
}
