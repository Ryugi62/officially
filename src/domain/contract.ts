/**
 * The public data contract (mirrored in /arkiv/schema.md, checked by tests/adapters/schema-contract.test.ts).
 * Anyone can build on these entities without asking: filter by `app`, trust by `$creator`.
 */
export const NAMESPACE = "officially.v1"

export type AttrType = "str" | "bytes32" | "addr" | "i32" | "u64"

export const CONTRACT = {
  namespace: NAMESPACE,
  entities: {
    project: {
      lifetime: "365 days",
      attributes: { app: "str", type: "str", project_slug: "str", publisher: "addr", revokes: "addr" },
    },
    endpoint: {
      lifetime: "30 days",
      attributes: { app: "str", type: "str", project_slug: "str", kind: "str", target_hash: "bytes32" },
    },
    incident: {
      lifetime: "72 hours",
      attributes: { app: "str", type: "str", project_slug: "str", target_hash: "bytes32", severity: "i32" },
    },
  },
} as const satisfies {
  namespace: string
  entities: Record<string, { lifetime: string; attributes: Record<string, AttrType> }>
}

export type EntityName = keyof typeof CONTRACT.entities
