import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// AC-5 (static half): the verdict code never reads a field anyone can write. Trust = $creator only.
// The property test in verdict.test.ts checks behaviour; this one checks the source of verdict.ts itself.
describe("AC-5 verdict.ts reads no writable field", () => {
  const src = readFileSync(new URL("../../src/domain/verdict.ts", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")

  it.each(["projectSlug", "slug", "label", "kind", "name", "title", "advice", "payload"])("never accesses .%s", (field) => {
    expect(src).not.toMatch(new RegExp(`\\.${field}\\b`))
  })

  it("decides trust from creator at least once", () => {
    expect(src).toMatch(/\.creator\b/)
  })
})
