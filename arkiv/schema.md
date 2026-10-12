# Officially — Arkiv schema (data contract `officially.v1`)

This file is the public data contract. Anyone can read, query and build on these Arkiv entities without asking us: filter by `app = "officially.v1"`, and **derive trust only from `$creator`** — every other attribute is writable by anyone who has test GLM.
A test (`tests/adapters/schema-contract.test.ts`) fails if this table and the code ever disagree.

## Entity types at a glance

| Entity type | Signed by (`$creator`) | Entity Expiration | Why this lifetime | Flags | `$owner` after the write |
|---|---|---|---|---|---|
| `project` | the project's **root key** (cold) | 365 days | Names who may publish for the project; replaced, never edited, when the publisher key rotates | `readonly` | root key |
| `endpoint` | the project's **publisher key** (hot) | 30 days, renewed on every deploy (Lifetime Extension) | A lease: an endpoint stays official only while the team keeps renewing it, so abandoned domains and retired contracts lapse by themselves | `readonly` | publisher key |
| `incident` | publisher or root key | by severity: 1 caution 24 hours · 2 do-not-sign 72 hours · 3 compromised 7 days — extendable **by anyone** | A warning should outlive a team that went dark; anyone who still sees the threat can keep it alive, nobody can edit or delete it. Worse threats get longer lives | `readonly`, `permissionlessExtension` | burn address `0x000000000000000000000000000000000000dEaD` (handed over in the same batch) |

## Attributes

Every attribute below is written with a typed constructor (`str`, `bytes32`, `addr`, `i32`). Queries must use the same type: `eq("target_hash", bytes32(h))` finds an entity, `eq("target_hash", h)` silently does not.

| Entity | Attribute | Type | Meaning | Used in queries for |
|---|---|---|---|---|
| `project` | `app` | `str` | Always `officially.v1` (namespace) | every query |
| `project` | `type` | `str` | Always `project` | every query |
| `project` | `project_slug` | `str` | Self-declared short name — **display only** | listing |
| `project` | `publisher` | `addr` | The hot key the root authorizes | building the trusted set |
| `project` | `revokes` | `addr` | The publisher this record replaced (absent on the first record) | `REVOKED` verdicts |
| `endpoint` | `app` | `str` | `officially.v1` | every query |
| `endpoint` | `type` | `str` | `endpoint` | every query |
| `endpoint` | `project_slug` | `str` | Self-declared — **display only**, never used for trust | display |
| `endpoint` | `kind` | `str` | `web`, `contract` or `social` | display, filtering |
| `endpoint` | `target_hash` | `bytes32` | keccak256 of the normalized target (see below) | the lookup |
| `incident` | `app` | `str` | `officially.v1` | every query |
| `incident` | `type` | `str` | `incident` | every query |
| `incident` | `project_slug` | `str` | Self-declared — display only | display |
| `incident` | `target_hash` | `bytes32` | Hash of the affected target, or `0x00…00` for the whole project | the lookup |
| `incident` | `severity` | `i32` | 1 = caution, 2 = do not sign, 3 = compromised (numeric so it can be range-queried) | `severity >= 2` filters |

System attributes the app relies on: `$creator` (trust), `$owner` (shows that incidents are burned), `$createdAt` (48-hour probation of new endpoints — computed in code, because the SDK refuses `$createdAt` predicates), `$expiresAt` (lease countdown and re-check time).

## Payloads (`application/json`, never queried)

| Entity | Payload |
|---|---|
| `project` | `{ "name": string, "slug": string, "publisher": address, "anchors": [{ "kind": "github" \| "ens" \| "well-known", "ref": string }] }` |
| `endpoint` | `{ "target": string, "label": string, "retiring"?: true }` — `retiring` marks an endpoint published with a scheduled retirement: its lease ends on that date and renewals skip it |
| `incident` | `{ "target": string \| "*", "title": string, "advice": string }` — rendered as plain text, links removed |

No payload ever holds a key, a secret or personal data: the writers refuse key-shaped hex, e-mail addresses, phone numbers and seed-phrase-shaped text (`src/domain/sensitive.ts`). All demo data is synthetic.

## Target normalization (so everyone hashes the same string)

| Input | Normalized target |
|---|---|
| `HTTPS://App.Example.org/swap?x=1` | `https://app.example.org` (origin only; punycode host; default port dropped) |
| `0xAbC…` on chain 1, or `eip155:1:0xAbC…` | `eip155:1:0xabc…` (CAIP-10, lowercase) |
| `@Handle`, `https://x.com/Handle/status/1` | `x:@handle` |

`target_hash = keccak256(utf8(normalized target))`, e.g. `keccak256("https://app.example.org")`.

## Queries the app runs (exact strings, printed by `npx tsx scripts/print-queries.ts`)

1. **Project records of a pinned root** — `app = str('officially.v1') AND type = str('project')` + `createdBy(<root>)`
2. **Trusted attestations for one or more targets** (one read for a whole transaction):
   `app = str('officially.v1') AND (type = str('endpoint') AND (target_hash = bytes32(<h1>) OR target_hash = bytes32(<h2>) …) OR type = str('incident') AND (target_hash = bytes32(<h1>) OR … OR target_hash = bytes32(0x00…00))) AND ($creator = addr(<root>) OR $creator = addr(<publisher>) OR $creator = addr(<revoked publisher>))`
   Filtering on `$creator` inside the query means claims spammed by other keys can never push a trusted claim out of the 200-result page.
3. **Conflicting claimants (bounded sample of 50)** — `app = str('officially.v1') AND type = str('endpoint') AND (target_hash = bytes32(<h1>) OR …)`
4. **A publisher's live claims, for renewal** — `app = str('officially.v1') AND type = str('endpoint')` + `createdBy(<publisher>)`, cursor-paginated
5. **Project directory** — `app = str('officially.v1') AND type = str('project')`, cursor-paginated

A check of one link, or of a whole transaction (origin + contract + spender), costs at most these three reads: 1, 2 and 3. The block number of read 2 is the "now" used for expiry and probation.

## Writes (each is one atomic `executeBatch`)

| Use case | Signer | Operations in the batch | Why it must be atomic |
|---|---|---|---|
| Publish endpoints | publisher | N × create `endpoint` | A deploy's endpoint set appears all at once or not at all |
| Renew leases | publisher | N × `extendEntity` (30 days from now) on every live claim not marked `retiring` | One transaction per deploy, one nonce |
| Raise incident | publisher or root | create `incident` (salt from `predictEntityKeys`) + `changeOwnership` → burn address | The warning never exists for a single block in a state where a stolen key could delete it |
| Keep a warning alive | **anyone** | `extendEntity` on the incident (its severity's lifetime, counted from now — Lifetime Extension sets, it does not add) | — (permissionless extension) |
| Rotate publisher | root | create new `project` record (`revokes` = old publisher) + delete the old record | There is never a moment with zero or two authorized publishers |

## Verdicts (computed in `src/domain/verdict.ts`, rules in order)

1. Trusted keys = the pinned root + the `publisher` of every live `project` record **created by** that root.
2. A live `incident` on the target (or project-wide) created by a trusted key → `INCIDENT`.
3. A live `endpoint` claim created by a trusted key → `OFFICIAL`, or `PROBATION` if all such claims are younger than 48 hours (86,400 blocks).
4. A claim created by a publisher the root rotated away from → `REVOKED`.
5. A claim created by any other key, whatever its `project_slug` says → `FORGED`.
6. No claim → `UNLISTED`. No pinned root → `UNPINNED`, with the list of keys that claim the target.

A transaction verdict is the worst of its parts: `INCIDENT` > `FORGED` > `REVOKED` > `UNLISTED` > `UNPINNED` > `PROBATION` > `OFFICIAL`.
