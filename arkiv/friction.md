# Friction report — building Officially on Arkiv

Every item below has a runnable repro in `scripts/repro/` (or `scripts/`) and the log it printed in `arkiv/repro-logs/`. If there is no log, it is not in this file.

**Environment for all items**: `@arkiv-network/sdk` 0.8.1 · `viem` 2.57.4 · Node v24.20.0 (macOS arm64) · Tiramisu testnet (chain 7738577), public RPC without an access key · 12 October 2026.

**The one thing Arkiv should improve first**: make the SDK query builder accept what the node already answers. The node filters on `$createdAt` and matches `*`; SDK 0.8.1 refuses both before sending, with an error that says `$createdAt` "carries no index". One source of truth for what can be queried would have saved us a design detour.

---

## Issues

### F1 — The SDK refuses `$createdAt` predicates the node answers (and says it "carries no index")
- **Surface**: TypeScript SDK query builder (`gt("$createdAt", u64(…))`) vs. node `arkiv_query`. Docs (retrieved 12 Oct 2026): [JSON-RPC → Querying Data](https://docs.arkiv.network/json-rpc/querying-data/) lists `$createdAt` as **Filterable: Yes**; [Fundamentals](https://docs.arkiv.network/start-here/fundamentals/) says of system attributes "You can query them".
- **Expected**: `client.select().where(and(eq("app", str("officially.v1")), gt("$createdAt", u64(460000)))).fetch()` returns entities created after block 460000.
- **Actual**: the builder throws before any request: `InvalidPredicateError: "$createdAt" is returned in query results but carries no index, so it cannot be filtered on. Select it and filter the results in JavaScript instead.` The same expression sent as raw JSON-RPC (`arkiv_query`, `app = str('officially.v1') AND $createdAt > u64(460000)`) **is answered** by the node, and the node really applies it: a bound beyond the chain head returns 0 rows, and a split at block 461000 partitions our publisher's entities into 9 created at or before it and 3 after it. `$creator`, `$owner` and `$expiresAt` predicates are accepted by both.
- **Repro**: `npx tsx scripts/repro/sys-attr-predicates.ts` → `arkiv/repro-logs/sys-attr-predicates.log` (SDK side) · `sh scripts/repro/raw-rpc-vs-sdk.sh` → `arkiv/repro-logs/raw-rpc-vs-sdk.log` (node side). Related: [sdk-js #100](https://github.com/Arkiv-Network/arkiv-sdk-js/issues/100) (2026-09-01).
- **Impact on us**: our 48-hour probation for newly published endpoints is naturally `$createdAt < now − 86,400 blocks`. We fetch and filter in code instead (`src/domain/verdict.ts`), so very fresh spam claims still use result slots.
- **What would fix it**: remove `$createdAt` from the SDK's "not filterable" list (the selection/expression validation in `@arkiv-network/sdk/query`) and correct the error text.

### F2 — Docs and node accept `*` ("match everything"); the SDK has no way to say it
- **Surface**: TypeScript SDK `select().fetch()` · docs (retrieved 12 Oct 2026) [Fundamentals → Query language](https://docs.arkiv.network/start-here/fundamentals/) ("Use `*` to match every entity") and [JSON-RPC → Querying Data](https://docs.arkiv.network/json-rpc/querying-data/) ("Match everything: `*`").
- **Expected**: some builder form (`select().all()`, or a query with no `where`) sends `*`.
- **Actual**: `InvalidPredicateError: A query needs at least one filter — the language has no spelling for 'match every entity". Add a where(...) predicate, or narrow by ownedBy(...) / createdBy(...).` — while raw `arkiv_query` with `*` returns entities. (The message also mixes quote characters: `'…"`.)
- **Repro**: `npx tsx scripts/repro/match-all.ts` → `arkiv/repro-logs/match-all.log` · node side in `raw-rpc-vs-sdk.log`.
- **Impact on us**: none in the product (we always filter on our namespace, which is the right design), but the three sources disagree and the error claims the language cannot express what the docs show.
- **What would fix it**: either add an explicit `all()` to the builder or change the error and the docs to say "the SDK requires a filter by design".

### F3 — Getting test GLM needs a browser wallet extension and a browser-fingerprinted captcha
- **Surface**: Arkiv Hub faucet (`hub.arkiv.network/faucet`, `/api/faucet`, Cap.js captcha at `cap.arkiv.network`). Docs (retrieved 12 Oct 2026) [Tiramisu](https://docs.arkiv.network/networks/tiramisu/) say only "Get test GLM from the faucet". The challenge's AGENTS.md asks AI coding agents to work with "a funded test wallet on Tiramisu".
- **Expected**: a builder whose key lives in an environment variable (the setup AGENTS.md recommends) can fund it — e.g. paste an address, solve a captcha.
- **Actual**: the page shows only "Connect your wallet — Sign in with your wallet to claim testnet $GLM" (no address field). Signing in with SIWE from Node works (`/api/auth/siwe/verify` → 200) and `GET /api/faucet` then answers (`amountGlm` 10), but the captcha's `redeem` answers `Blocked by instrumentation` to a correctly solved proof of work from outside a browser. So an env-var key cannot be funded without first loading it into a browser wallet. We did not work around the instrumentation; we connected a minimal provider in a real browser tab whose only signature (the Hub's SIWE message) came from a local signer, and the browser solved the captcha (`scripts/ops/faucet-repl.js`, `scripts/ops/local-signer.ts`). (In hindsight one claim would have been enough: plain GLM transfers between wallets work — see F5 — but the docs told us they would revert, so we signed in and claimed once per wallet.)
- **Repro**: `HUB_KEY=<testnet key> npx tsx scripts/repro/faucet-headless.ts <address>` → `arkiv/repro-logs/faucet-headless.log`.
- **What would fix it**: an address field on the faucet (the API already takes `recipient`), or a documented CLI/agent path (for example SIWE + a non-instrumented proof of work for testnet only).

### F4 — The SDK README offers a shared example private key; it holds 0 GLM
- **Surface**: `@arkiv-network/sdk` README, "Wallet Client Example (Create Entity)".
- **Expected**: "For quick testing, you may use this example key: `0x3d05…7a5e`. However, funds may not always be available for this key." — a newcomer copies it and expects the tutorial write to work.
- **Actual**: address `0xc360B9FBB59edDB38042745d315661409Ad16cf9` holds **0 GLM** at block 459929, so the tutorial write cannot succeed; it also teaches pasting a private key into source, which AGENTS.md says never to do.
- **Repro**: `npx tsx scripts/repro/example-key-balance.ts` → `arkiv/repro-logs/example-key-balance.log`.
- **What would fix it**: remove the shared key; show `privateKeyToAccount(process.env.PRIVATE_KEY)` and a link to the faucet.

### F5 — Docs say every non-Arkiv transaction reverts; a plain GLM transfer succeeds
- **Surface**: docs (retrieved 12 Oct 2026) [Fundamentals → A chain with a database engine instead of the EVM](https://docs.arkiv.network/start-here/fundamentals/): "A transaction is accepted only if its `to` address is a known Arkiv operation address. Every other transaction reverts."
- **Expected** (from the docs): `walletClient.sendTransaction({ to: <another EOA>, value: parseEther("0.01") })` reverts.
- **Actual**: status `success`, recipient balance 9.999893… → 10.009893… GLM (tx `0x93b1cb62…e67e`).
- **Repro**: `FROM_KEY=<testnet key> npx tsx scripts/repro/plain-transfer.ts <address>` → `arkiv/repro-logs/plain-transfer.log`.
- **Impact on us**: we believed the docs and claimed the faucet once per wallet (4 sign-ins, 1-hour cooldown each) instead of funding three wallets from one.
- **What would fix it**: say that value transfers are accepted and only contract calls/deployments revert (or whatever the intended rule is) — teams planning gas for several writer wallets need to know.

### F6 — The anonymous RPC budget is two windows and per-call costs, visible only in response headers
- **Surface**: public Tiramisu RPC without an access key. Docs (retrieved 12 Oct 2026) [Access Keys](https://docs.arkiv.network/start-here/access-keys/): "The public RPC works without one, at the default rate limit." — no numbers.
- **Expected**: a documented budget, so an app meant to be opened by judges and users without a key can be sized.
- **Actual** (headers we captured): `ratelimit: limit=600, remaining=599, reset=60` and `arkiv-cost: 100` for one `arkiv_query`; about an hour after our first commit the same IP got `HTTP 429` with `ratelimit: limit=10000, remaining=0, reset=824` and `retry-after: 824`. So there is a 600-unit-per-minute window **and** a 10,000-unit longer window, and one query costs 100: about 6 queries a minute and 100 per window per IP. (Inferred from these headers on one IP and one morning, three captured calls; the exact window lengths are not documented.)
- **Repro**: `arkiv/repro-logs/rpc-cost.log` (curl of three calls with their headers; the third is the 429). Related: [reported-issues #17](https://github.com/Arkiv-Network/reported-issues/issues/17) (the SDK silently waits out `Retry-After` when retries are on).
- **Impact on us**: a judge who flips the demo switch a few times would exhaust the per-minute window. We added a caching reader (`src/adapters/memory/caching-reader.ts`: project records 5 min, checks 20 s, invalidated by the live incident feed), `retryCount: 0` plus a 15 s timeout, and a published snapshot fallback that the page announces when it is used.
- **What would fix it**: put both windows and the per-method costs in the Access Keys page, and make the SDK surface a 429 as a typed error with the `Retry-After` value instead of waiting.

---

## Smooth paths (tested, worked as documented)

### S1 — `$creator` inside `where()`, including OR over several creators
- **Tested**: `or(eq("$creator", addr(root)), eq("$creator", addr(publisher)))` combined with typed attribute predicates, from the SDK and from raw JSON-RPC.
- **Expected → result**: accepted and answered by both (`sys-attr-predicates.log`, `raw-rpc-vs-sdk.log`). This is what lets one read keep only the project's keys.

### S2 — Atomic batch: create + ownership transfer to a burn address, with `predictEntityKeys`
- **Tested**: `predictEntityKeys({ owner, count: 1 })`, then `executeBatch({ creates: [{ …, salt }], ownershipChanges: [{ entityKey: predicted, newOwner: 0x…dEaD }] })`.
- **Expected → result**: the created key equals the predicted key; `getEntity` shows creator = publisher, owner = `0x…dEaD`, flags `readonly + permissionlessExtension` (`seed-run-2.log`, `extend-paths.log`).

### S3 — Permissionless extension by a stranger; refusal for everyone else
- **Tested**: a third wallet calls `extendEntity` on the burned incident (flag set) and on a publisher's endpoint (flag not set).
- **Expected → result**: the first succeeds (expiry 590231 → 590260: Lifetime Extension **sets** the lifetime from now, as documented — it does not add); the second fails with a clear message: `entity 0x99604748…da49bd is owned by 0x04a1…438F, not 0x8198…5ec2` (`extend-paths.log`). A stranger trying to *shorten* the burned warning (extend to 1 hour from now) is refused: `already expires at block 590260, so extending it to 463310 would shorten its life` (`shorten-incident.log`) — so permissionless extension cannot be used to silence a warning.

### S4 — `watchEntityEvents` over a WebSocket transport, no `fromBlock`
- **Tested**: subscribe with `createPublicClient({ transport: webSocket(wss://…) })`, then raise an incident from another process.
- **Expected → result**: transport type `webSocket`; the `EntityCreated` event for the same key arrived 817 ms after the write resolved (5.3 s after send, including ~2 s blocks) (`ws-incident-latency.log`). In the browser (headless Chromium on the deployed page), an incident raised by the CLI from another process showed its banner 4,830 ms after sending, with one page navigation in total (`browser-live.log`). Note: as [sdk-js #112](https://github.com/Arkiv-Network/arkiv-sdk-js/issues/112) says, nothing tells the caller whether it is pushing or polling; we infer push from the transport.

### S7 — Cursor pagination walks the same set
- **Tested**: the publisher's claims read once with `limit(200)` and walked with `limit(2)` + `cursor()`.
- **Expected → result**: same 8 claims, 4 pages, 0 duplicates (`cursor-walk.log`).

### S8 — Key rotation: create + delete of a `readonly` record in one batch
- **Tested**: the root signs `executeBatch({ creates: [new project record], deletes: [old record] })`; then a second wallet re-publishes the endpoints.
- **Expected → result**: one transaction; right after it, the old publisher's claim on `https://app.demo-swap.example` reads `REVOKED` (`rotation.log`). `readonly` blocked edits but not the owner's delete, exactly as documented. The reads after it in the same log hit the anonymous budget (F6: HTTP 429 `ANON_COST_LIMITED`), and the CLI reported them immediately instead of hanging (`retryCount: 0`).

### S5 — Public reads from Node and from a static page, no key
- **Tested**: 10 checks (half single links, half whole transactions) against the public RPC.
- **Result**: p50 664 ms, p90 1,598 ms, at most 3 RPC requests per check (`measure-latency.log`); the SDK's ESM build bundles into a static page with no Node polyfills (size in `arkiv/repro-logs/web-build.log`).

### S6 — `render()` prints the exact query string the builder sends
- **Tested**: `render(expression)` on our compound queries (`scripts/print-queries.ts`).
- **Result**: identical to what we document in `/arkiv/schema.md`, so the schema shows literal queries.
