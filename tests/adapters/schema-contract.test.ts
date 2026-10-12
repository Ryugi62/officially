// AC-15 the data contract in /arkiv/schema.md is exactly what the code writes
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { CONTRACT } from "../../src/domain/contract"

const md = readFileSync(new URL("../../arkiv/schema.md", import.meta.url), "utf8")

function schemaRows(): Set<string> {
  // rows like: | endpoint | target_hash | bytes32 | ... |
  const rows = new Set<string>()
  for (const line of md.split("\n")) {
    const m = line.match(/^\|\s*`?(project|endpoint|incident)`?\s*\|\s*`([a-z0-9_]+)`\s*\|\s*`?(str|bytes32|addr|i32|u64)`?\s*\|/)
    if (m) rows.add(`${m[1]}.${m[2]}:${m[3]}`)
  }
  return rows
}

function codeRows(): Set<string> {
  const rows = new Set<string>()
  for (const [entity, attrs] of Object.entries(CONTRACT.entities)) {
    for (const [name, type] of Object.entries(attrs.attributes)) rows.add(`${entity}.${name}:${type}`)
  }
  return rows
}

describe("schema.md ↔ code contract (AC-15)", () => {
  it("lists every attribute the code writes, with the same type, and nothing else", () => {
    expect(schemaRows()).toEqual(codeRows())
  })
  it("states the expiration of every entity type", () => {
    for (const entity of Object.keys(CONTRACT.entities)) {
      expect(md).toMatch(new RegExp(`\\|\\s*\`?${entity}\`?\\s*\\|[^\\n]*(days|hours)`))
    }
  })
  it("never uses the word TTL (Arkiv vocabulary)", () => {
    expect(md).not.toMatch(/\bTTL\b/)
  })
})

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? files(p) : [p]
  })
}

describe("layering (Clean Architecture)", () => {
  const src = new URL("../../src/", import.meta.url).pathname
  it("domain imports nothing outside domain (no SDK, no viem, no I/O)", () => {
    for (const f of files(join(src, "domain"))) {
      const text = readFileSync(f, "utf8")
      expect(text, f).not.toMatch(/from\s+["'](@arkiv-network|viem|node:)/)
      expect(text, f).not.toMatch(/from\s+["']\.\.\/(application|adapters|infrastructure)/)
    }
  })
  it("application imports only domain", () => {
    for (const f of files(join(src, "application"))) {
      const text = readFileSync(f, "utf8")
      expect(text, f).not.toMatch(/from\s+["'](@arkiv-network|viem)/)
      expect(text, f).not.toMatch(/from\s+["']\.\.\/(adapters|infrastructure)/)
    }
  })
  it("the CLI never imports the web adapter", () => {
    for (const f of files(join(src, "adapters", "cli"))) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/adapters\/web|\.\.\/web\//)
    }
  })
})
