# Friction report — building Officially on Arkiv

Every item has a runnable repro in `scripts/repro/` and the log it printed in `arkiv/repro-logs/`. Nothing here is from memory: if there is no log, it is not in this file.

**Environment for all items**: `@arkiv-network/sdk` 0.8.1 · `viem` 2.57.4 · Node v24.20.0 (macOS, arm64) · Tiramisu testnet (chain 7738577), public RPC without an access key · dates 2026-10-12 onward.

**The one thing Arkiv should improve first**: make the docs, the SDK and its error messages agree on what a query can filter on (system attributes and the "match everything" query) — today each of the three says something different, and a builder only finds out at runtime.

---

## Issues

### F1 — Docs say `*` matches every entity; the SDK query builder refuses any query without a filter
- **Surface**: TypeScript SDK `select().fetch()` · docs "Fundamentals → Query language".
- **Expected**: Fundamentals says: "Use `*` to match every entity." So `client.select({ key: true }).limit(1).fetch()` (or an explicit `*`) should return entities.
- **Actual**: `InvalidPredicateError: A query needs at least one filter — the language has no spelling for 'match every entity". Add a where(...) predicate, or narrow by ownedBy(...) / createdBy(...).` (also note the mismatched quotes `'…"`). The SDK has no way to express `*`.
- **Repro**: `npx tsx scripts/repro/match-all.ts` → log `arkiv/repro-logs/match-all.log`.
- **Impact on us**: a directory page ("list every project") must invent a namespace filter. We filter on `app = "officially.v1"`, which is the right design anyway, but the docs pointed the other way.
- **What would fix it**: either drop the `*` sentence from Fundamentals, or add `select().all()` that renders `*`; and fix the quote in the error message.

### F2 — `$createdAt` cannot be filtered in the SDK, although the docs say system attributes are queryable
- **Surface**: TypeScript SDK query builder (`gt("$createdAt", u64(…))`) · docs "Fundamentals → Core concepts" · sdk-js issue #100.
- **Expected**: Fundamentals: "The protocol also keeps system attributes on every entity: `$owner`, `$creator`, `$createdAt`, `$updatedAt`, and `$expiresAt`. You can query them." Issue #100 (2026-09-01) says the Tiramisu node indexes `$createdAt` and answers such a query.
- **Actual** (same run, same block 459928): `$creator = addr(…)` OK · `$owner = addr(…)` OK · `$expiresAt > u64(1)` OK · `$creator = … OR $creator = …` OK · `$createdAt > u64(1)` → `InvalidPredicateError: "$createdAt" is returned in query results but carries no index, so it cannot be filtered on. Select it and filter the results in JavaScript instead.` The SDK error and the issue contradict each other about whether the node indexes it.
- **Repro**: `npx tsx scripts/repro/sys-attr-predicates.ts` → `arkiv/repro-logs/sys-attr-predicates.log`.
- **Impact on us**: our 48-hour probation for newly published endpoints ("only trust claims older than 86,400 blocks") would be one predicate; instead we fetch and filter in code (`src/domain/verdict.ts`). Fine at our scale, but it means a spammer's fresh claims still consume the 200-result page — we worked around it by filtering on `$creator` inside the query (which does work, see "smooth paths").
- **What would fix it**: one source of truth — either index `$createdAt` and let the builder accept it, or change the Fundamentals sentence to list which system attributes are filterable (`$creator`, `$owner`, `$expiresAt`) and which are only returned.

### F3 — The SDK README offers a shared example private key for the write tutorial, and it has 0 GLM
- **Surface**: `@arkiv-network/sdk` README, "Wallet Client Example (Create Entity)".
- **Expected**: "For quick testing, you may use this example key: `0x3d05…7a5e`. However, funds may not always be available for this key." — a newcomer copies it and expects the tutorial write to go through.
- **Actual**: address `0xc360B9FBB59edDB38042745d315661409Ad16cf9`, balance **0 GLM** at block 459929; the tutorial cannot succeed with it. It also normalizes pasting a private key into source code, which the challenge's own AGENTS.md tells builders never to do.
- **Repro**: `npx tsx scripts/repro/example-key-balance.ts` → `arkiv/repro-logs/example-key-balance.log`.
- **What would fix it**: remove the shared key; show `privateKeyToAccount(process.env.PRIVATE_KEY)` plus a one-line pointer to the faucet (hub.arkiv.network/faucet).

---

## Smooth paths (tested, worked as documented)

### S1 — Filtering on `$creator` inside `where()`, including OR over several creators
- **Tested**: `eq("$creator", addr(A))` and `or(eq("$creator", addr(A)), eq("$creator", addr(B)))` combined with typed attribute predicates.
- **Expected**: accepted by the builder and answered by the node.
- **Result**: both accepted and answered (log `sys-attr-predicates.log`). This is what lets Officially ask "claims on this hash **created by this project's keys**" in one read, so spam claims by other keys can never crowd a trusted claim out of the 200-result page.

### S2 — Public reads from Node and from a static page with no key
- **Tested**: `createPublicClient({ chain: tiramisu, transport: http(undefined, { retryCount: 0 }) })`, `select().where(…).fetch()`, `getEntityCount()`, `getBlockNumber()` from the CLI and from the Vite-built page served on 127.0.0.1.
- **Result**: worked; the SDK's ESM build bundled into a 98 KB (gzip) page with no Node polyfills.

### S3 — `render()` prints the exact query string the builder sends
- **Tested**: `render(expression)` from `@arkiv-network/sdk/query` on our compound queries (`scripts/print-queries.ts`).
- **Result**: matches what we document in `/arkiv/schema.md`, so the schema file shows the literal queries rather than a paraphrase.

*(Write-path items — batch writes, predicted keys, ownership transfer, permissionless extension, WebSocket events — are added as they are run on Tiramisu.)*
