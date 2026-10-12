# Officially — SPEC (SDD, v0.1 2026-10-12)

## 0. One line
**Officially** lets anyone check, with no server in between, whether a link, contract address or social handle was published by a Web3 project's own key, whether that publication is still live, and whether the project has raised an incident on it.
The essence is **not** "another phishing blocklist" (a vendor's opinion, updated after the fact) but **the project's own signed, expiring allowlist that nobody can edit, censor or take down — including the project's hijacked DNS, its hacked X account, or us.**

## 1. Success conditions (numbers) · deadline (constant) · non-goals
- Reference (same problem, existing results): MetaMask `eth-phishing-detect` (vendor-curated block/allow list, GitHub), Blockaid/ScamSniffer (vendor scanning), Uniswap interface releases (per-release IPFS CID the user verifies by hand). None is authored by the project's own key and queryable across projects. Harm this targets: Curve DNS hijack 2022-08-09 (~$573K), Balancer DNS hijack 2023-09-19 (~$238K), Curve DNS hijack again 2025-05-12.
- Success:
  - A check of one target costs **≤ 3 RPC calls** and returns a verdict in **≤ 3 s** (p50, public Tiramisu RPC, measured by `scripts/measure-latency`).
  - The verdict depends **only** on `$creator` / `createdBy()` for trust; changing any writable attribute (`project_slug`, `kind`) never turns a forged claim into an official one (property test).
  - A second client (CLI) that imports nothing from the web app reproduces every verdict of the shared fixture set (contract test).
  - Every Arkiv feature claimed in the README is found by `scripts/check-features` in the code **and** on chain (0 missing).
  - `/arkiv/friction.md` ≥ 8 issues, each with a runnable repro script and its captured log; ≥ 3 smooth paths documented the same way.
  - ≥ 40 automated tests passing; demo video ≤ 2:50.
- Floor: gates of the challenge all pass (public deployment on Tiramisu, MIT repo, schema.md, friction.md, wallet addresses, ≤ 3 min video).
- Deadline: submission 2026-10-18 20:00 KST (official close 2026-10-18 23:59 London = 2026-10-19 07:59 KST). Demo entities must stay live until ≥ 2026-10-24.
- Non-goals: a browser extension; mainnet; storing website contents; real projects' endpoints signed by our key (that would be impersonation — demo projects are synthetic and labelled so); any user data or analytics; paid services.

## 2. Constraints
- Challenge rules (quotes): "Use Arkiv as the primary data layer, through the official SDK (`@arkiv-network/sdk` 0.8.x) or direct RPC." · "Private keys or secrets stored in Arkiv, or real personal data stored in plaintext or hashed form" disqualify. · "Original work created between 9 and 18 October 2026." · "AI coding assistants are allowed."
- SDK facts (AGENTS.md of the challenge): no server-side ordering; ranges only on numeric attributes; payload not queryable; everything expires; `extendEntity` sets a new expiry; trust comes from `$creator`; `watchEntityEvents` uses a real socket only with a WebSocket transport and no `fromBlock`.
- Cost: $0 (testnet GLM from the faucet, free static hosting). Public RPC without key: ~100 requests per IP before HTTP 429 (reported-issues #17) → the app batches and caches.
- Security: private keys live only in environment variables / the OS keychain, never in the repo or in Arkiv. All demo data is synthetic.
- Vocabulary: "Arkiv entities", "Entity Expiration", "Lifetime Extension". Never "TTL".

## 3. Ubiquitous language (DDD glossary) — 1:1 with code names
| Term | Meaning | Code name |
|---|---|---|
| Root key | A project's cold identity address. Signs Project records only. | `rootKey` |
| Publisher key | Hot address the root authorizes to publish Endpoint claims and Incidents. | `publisher` |
| Project record | Root-signed entity naming the current publisher and the project's anchors. | `ProjectRecord` (entity type `project`) |
| Anchor | Off-Arkiv place where the project states its root key (GitHub file, ENS text record, `/.well-known/officially.json`). | `Anchor` |
| Target | A normalized thing a user is about to trust: web origin, `eip155:<chainId>:<address>`, or `x:@handle`. | `Target` |
| Target hash | keccak256 of the normalized target, stored as a `bytes32` attribute. | `targetHash` |
| Endpoint claim | Publisher-signed, readonly entity: "this target is one of our official endpoints". | `EndpointClaim` (type `endpoint`) |
| Lease | An Endpoint claim's lifetime, renewed by the publisher's activity (Lifetime Extension). A lapsed lease means "no longer official". | `Lease` |
| Incident | Publisher- or root-signed, readonly entity: "do not trust this target (or the whole project) right now". | `Incident` (type `incident`) |
| Keep-alive | Anyone extending an Incident's lifetime (created with permissionless extension). | `keepAlive` |
| Burn | Transferring an Incident's ownership to the burn address in the same batch that creates it, so no key — not even a stolen publisher key — can delete it. | `BURN_ADDRESS` |
| Pin | A user's local record of which root key is project X (trust on first use, checked against anchors). | `Pin` |
| Verdict | Result of a check: `OFFICIAL`, `INCIDENT`, `FORGED`, `REVOKED`, `UNLISTED`, `UNPINNED`. | `Verdict` |

## 4. Bounded context · domain model
- Context: **Endpoint attestation** (one context). Arkiv is an adapter behind ports.
- Value objects: `Target`, `TargetHash`, `Address`, `Lease`.
- Entities (domain, not Arkiv): `ProjectRecord`, `EndpointClaim`, `Incident`, each carrying `creator` (immutable author), `owner`, `createdAtBlock`, `expiresAtBlock`, `key`.
- Domain services: `normalizeTarget`, `hashTarget`, `trustedPublishers(rootKey, projectRecords)`, `decideVerdict(input)`.
- Ports: `AttestationReader` (findClaims(targetHash), findIncidents(targetHash, creators), findProjectRecords(rootKey), listProjects(cursor)), `AttestationWriter` (publishEndpoints, renewLeases, raiseIncident, keepAlive, rotatePublisher), `IncidentFeed` (subscribe), `Clock` (current block).

### Verdict rules (pure, in order)
1. Trusted set T = {rootKey} ∪ {publisher of every live Project record **created by** rootKey}.
2. Any live Incident on the target hash, or project-wide (target hash = 0x00…00), **created by** a key in T → `INCIDENT` (overrides everything below).
3. A live Endpoint claim on the target hash **created by** a key in T → `OFFICIAL` (with lease expiry and the creating key).
4. A live claim on the target hash created by a key that appeared in a **deleted/superseded** Project record of rootKey → `REVOKED`.
5. A live claim on the target hash created by any other key, whatever its self-declared `project_slug` → `FORGED` (shows the real creator).
6. No live claim on the target hash → `UNLISTED` ("this project has not published it").
7. No pinned root for the project → `UNPINNED`, with the list of creators that claim the target (reverse lookup) so the user can pin after checking anchors.
Writable attributes (`project_slug`, `kind`, payload fields) are displayed but never used in rules 1–6.

## 5. Use cases (application)
| UC | Input | Output | Rules |
|---|---|---|---|
| UC-1 CheckTarget | raw target string, pinned root (optional) | Verdict + evidence (entity keys, creators, expiry blocks) | ≤ 3 reads; rules §4 |
| UC-2 PublishEndpoints | publisher wallet, targets[] | entity keys | one atomic batch; readonly; lease 30 days |
| UC-3 RenewLeases | publisher wallet | extended keys + new expiry | one batch of `extendEntity` over the publisher's live claims; run on each deploy (activity) |
| UC-4 RaiseIncident | publisher/root wallet, target or project-wide, severity, advice | incident key | one batch: create (readonly + permissionless extension, 72 h) + ownership → burn address, salt from `predictEntityKeys` |
| UC-5 KeepAlive | any wallet, incident key | new expiry | `extendEntity` by a non-owner (permissionless extension) |
| UC-6 RotatePublisher | root wallet, new publisher | new record key | one batch: create new Project record + delete the old one (never zero or two authorized records) |
| UC-7 WatchIncidents | trusted set | live UI update | `watchEntityEvents` over WebSocket, no `fromBlock`; filter `EntityCreated` by creator ∈ T and type `incident` |
| UC-8 ListProjects | cursor | page of Project records | cursor pagination, ≤ 200/page |

## 6. Acceptance criteria (Given/When/Then) — each becomes ≥ 1 test
- AC-1 normalize: Given `HTTPS://App.Example.org/swap?x=1#y`, When normalized, Then target = `https://app.example.org` (origin only, lowercase host, default port dropped). Given `0xAbC…` with chain 1, Then `eip155:1:0xabc…`. Given `@Curve`/`https://x.com/Curve`, Then `x:@curve`.
- AC-2 hash: same target → same 32-byte hash; different targets → different hashes; hash matches keccak256(utf8(target)) from viem (contract test).
- AC-3 official: Given a live claim created by the publisher named in the root's live Project record, When checked, Then `OFFICIAL` with lease expiry.
- AC-4 forged: Given a claim with identical attributes and payload but created by another key, Then `FORGED` and the evidence shows that creator.
- AC-5 writable fields ignored: For any claim not created by a trusted key, setting `project_slug` to the pinned project's slug never yields `OFFICIAL` (property test over random attribute values).
- AC-6 incident overrides: Given an official claim and a live Incident by a trusted key on the same hash (or project-wide), Then `INCIDENT`. An Incident created by an untrusted key does **not** change the verdict (and is shown as "unverified warning").
- AC-7 revoked: Given the root rotated from publisher A to B (A's record deleted), When a claim by A is checked, Then `REVOKED`.
- AC-8 unlisted / unpinned: no claim → `UNLISTED`; no pin → `UNPINNED` with the claimant list.
- AC-9 lapse: Given a claim whose expiry block ≤ current block (a reader that still returned it), Then it is treated as absent (`UNLISTED`), and the UI schedules a re-check at the expiry block of each live claim.
- AC-10 incident batch: RaiseIncident sends exactly one transaction containing one create (flags readonly + permissionlessExtension, expiry 72 h) and one ownership change of the predicted key to the burn address.
- AC-11 rotation batch: RotatePublisher sends one transaction with one create and one delete.
- AC-12 renew batch: RenewLeases sends one transaction extending every live claim of the publisher; zero claims → no transaction.
- AC-13 reads budget: CheckTarget performs ≤ 3 reader calls.
- AC-14 watch: the incident feed is built with a WebSocket transport and without `fromBlock`; an `EntityCreated` of type incident by a trusted creator flips the shown verdict without a page reload.
- AC-15 schema contract: every attribute name written by the writer is listed in `/arkiv/schema.md` with the same type; the CLI parses entities using only the schema (no import from `src/web`).
- AC-16 no secrets / personal data: the seed and every writer reject payloads containing a private-key-shaped hex string or an email/phone pattern.

## 7. Architecture (Clean) — dependencies point inward
```
src/domain/        pure: target, hash, verdict, types (no SDK, no I/O)
src/application/   use cases + ports (interfaces)
src/adapters/      arkiv/ (SDK reader, writer, feed) · cli/ · web/ (DOM view)
src/infrastructure composition roots: web main, cli main, config (RPC URLs, chain)
tests/             vitest: domain, application (fake ports), adapters (contract), e2e scripts (Tiramisu)
arkiv/             schema.md, friction.md
scripts/           seed, renew, check-features, measure-latency, repro/*
```
Ports ↔ adapters: `AttestationReader` ↔ `ArkivReader` (public client, HTTP) · `AttestationWriter` ↔ `ArkivWriter` (wallet client) · `IncidentFeed` ↔ `ArkivIncidentFeed` (public client, WebSocket) · `Clock` ↔ `ArkivClock` (block number).

## 8. Non-functional
- Static web app only (GitHub Pages); no server. Reads ≤ 3 per check, cached 20 s per target; WebSocket single connection.
- Writes run from the CLI with keys from environment variables; `.env*` is git-ignored; a pre-commit check rejects key-shaped strings.
- Rate-limit behaviour (429) surfaces as a visible message, never a silent hang (timeout 15 s per read).
- Accessibility: verdict conveyed by text + icon, not color alone; works at 390 px width.

## 9. Physical verification (beyond unit tests)
- Seed synthetic demo projects on Tiramisu; record every tx hash and entity key in `arkiv/evidence.md`.
- Run `scripts/check-features` (code + chain), `scripts/measure-latency` (≥ 20 checks), and every `scripts/repro/*` against Tiramisu; commit logs.
- Open the deployed URL in a logged-out browser at 390 px and 1280 px; capture screenshots; verify a live incident flips the verdict without reload.

## 10. Change log
- v0.1 2026-10-12 first version (idea chosen by blind scoring; see submission notes).
