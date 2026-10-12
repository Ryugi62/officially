# Officially

**A hijacked frontend can change everything on the page except the project's key.**
Officially checks, right before you sign, that the contract or spender your wallet is asked to approve — and the site asking — were published by the project's own key on [Arkiv](https://arkiv.network), are still live, and are not under an incident the project raised. No server, no indexer: the check is one Arkiv query anyone can run.

- **Live app:** https://ryugi62.github.io/officially/ — no wallet, no sign-up. Flip "This site's DNS was hijacked" and press Approve.
- **Check from a terminal (no wallet):**
  ```bash
  npx github:Ryugi62/officially check-tx --chain 11155111 \
    --origin https://app.demo-swap.example \
    --to 0x5eed00000000000000000000000000000000aaaa \
    --data 0x095ea7b3000000000000000000000000bad0000000000000000000000000000000000bad00000000000000000000000000000000000000000000000000000000000003e8 \
    --root 0x70E5d4986A251a5173Acf59c86178e144B62864E
  # → TRANSACTION FORGED: the spender 0xbad0…0bad was "published" under Demo Swap's name by a key that is not Demo Swap's
  ```
- Data contract [`/arkiv/schema.md`](arkiv/schema.md) · Friction report [`/arkiv/friction.md`](arkiv/friction.md) · On-chain evidence [`/arkiv/evidence.md`](arkiv/evidence.md) · Feature check [`/arkiv/features.md`](arkiv/features.md) · Spec [`SPEC.md`](SPEC.md)
- Tracks: **Security** (primary), Censorship Resistance, Open Source. All demo data is synthetic: a fictional "Demo Swap" on `*.example` domains with made-up addresses.

## Who is misled today

| When | What happened | Loss | Source |
|---|---|---|---|
| 9–10 Aug 2022 | Curve's DNS was hijacked; the cloned site "requested approval to a malicious contract used to drain funds" | ~$570K | [Curve Market Cap newsletter](https://curve.substack.com/p/august-10-2022-curve-frontend-hacked) |
| 19–20 Sep 2023 | Balancer's frontend was hit by a DNS attack | over $250K | [Decrypt, 20 Sep 2023](https://decrypt.co/197953/balancer-frontend-hit-by-dns-attack-over-250k-stolen) |
| 12–13 May 2025 | Curve's DNS was hijacked **again**, sending users to a malicious site | not disclosed | [Cointelegraph, 13 May 2025](https://cointelegraph.com/news/curve-finance-warns-dns-hijacked-again) |

The pattern repeats because the victim does everything right: they type the real domain, see the real-looking page, and sign. **The domain is official; the spender is not.** A domain allowlist passes this attack. Officially checks the spender.

**What changes from day one.** A project runs one command on its next deploy (`officially publish …`) and its official sites, handles and contracts — and any incident it raises — become checkable by anyone, from a web page, a CLI, a wallet or a bot, without trusting the project's DNS, its X account, or us.

## What Officially is not (and what already exists)

| Existing | How it works | What it does not do that Officially does |
|---|---|---|
| [MetaMask eth-phishing-detect](https://github.com/MetaMask/eth-phishing-detect), [Blockaid](https://www.blockaid.io), [ScamSniffer](https://scamsniffer.io) | A vendor's block/allow list or scanner | Not authored by the project; a brand-new drainer on the official domain is unknown until a vendor flags it |
| [Reown (WalletConnect) Verify](https://docs.reown.com/appkit/domain-verification) | Checks the request comes from the registered domain | A hijacked official domain still verifies |
| [SEAL Safe Harbor](https://github.com/security-alliance/safe-harbor), [ENS text records](https://docs.ens.domains/ensip/5) | Project-signed address lists / records on Ethereum | Answering "which key published **this** address?" needs an indexer; no expiry, no incident state |
| Arkiv Canary, Lapse (other entries in this challenge) | Warrant canaries: an organization's liveness statement that dies if not renewed | Officially is not a canary: it checks the **addresses a signature would authorize** against the set the project's key published |

## Why Arkiv

| If we used… | What breaks |
|---|---|
| **Postgres behind our API** | It becomes a second hijackable frontend. Whoever takes over our DNS or server can rewrite "official", and history can be edited silently. Users must trust us. |
| **IPFS (+ IPNS / DNSLink)** | Content is addressed by hash, but "the latest list for project X" goes through IPNS or DNSLink — DNS again, the thing being attacked. There is no way to ask "which key published this address?" across projects, and nothing expires. |
| **A subgraph** | Needs a contract plus an indexer. The indexer is an operator, and expiry, leases and burned warnings would have to be rebuilt in Solidity. |
| **Our own signed JSON API** | Same single point of failure as the project's DNS, and the reverse lookup "who claims this spender" needs our server. |

**The Arkiv property Officially relies on, and what happens without it:**
- **Immutable `$creator`, filtered inside the query.** The verdict is one read: entities on these target hashes whose `$creator` is the project's root or publisher key (`$creator = addr(…) OR $creator = addr(…)` in `where()`). Remove it and the product falls apart: anyone with test GLM can write an identical claim, as our simulated attacker did, and only `$creator` tells them apart. The demo shows that claim as **FORGED**.
- **Entity Expiration as a lease.** An endpoint is official only while the publisher keeps renewing it. Retired endpoints lapse by themselves; three demo endpoints lapse on 20, 21 and 22 October, during judging.
- **`readonly` + `permissionlessExtension` + ownership transfer to `0x…dEaD` in one atomic batch.** A warning nobody — not even a stolen project key — can edit or delete, and anyone can keep alive.

**Kept off Arkiv on purpose:** private keys (keychain and environment variables only) · website contents and frontend bundles (large, and not what is attacked) · who checks what (verification runs client-side, nothing is logged) · the user's pinned project list (stays on their device) · raw anchor proofs (GitHub/ENS hold them; the project record only points to them).

## How Officially uses Arkiv

Every row is verified in the code **and** on Tiramisu by `npx tsx scripts/check-features.ts` (log: [`arkiv/repro-logs/check-features.log`](arkiv/repro-logs/check-features.log); full table with code links: [`arkiv/features.md`](arkiv/features.md)).

| Feature | What the user sees | Why |
|---|---|---|
| Typed attributes vs payload | Lookups by `target_hash` (bytes32) and `severity` (i32); labels and advice stay in the payload | Index only what is filtered |
| Compound query with `$creator` in `where()` | One read checks a whole transaction (origin + contract + spender) | Spam claims by other keys cannot crowd a trusted claim out of the 200-result page |
| `createdBy()` + cursor pagination | Project records of the pinned root; a publisher renews all its claims | Authorship enforced by the node |
| Entity Expiration per type | Lease countdown on each verdict; retiring endpoints lapse | Project record 365 d · endpoint 30 d · incident 24 h / 72 h / 7 d by severity |
| Lifetime Extension as a lease | Endpoints stay official only while renewed on each deploy | Forgotten endpoints stop being official on their own |
| `readonly` + `permissionlessExtension` | Claims cannot be edited; anyone can keep a warning alive | A stolen key cannot rewrite history; a dark team cannot silence a warning |
| `$creator` vs `$owner`, ownership transfer | Verdicts name the creating key; incidents show owner `0x…dEaD` | Trust from the immutable creator; burned ownership means nobody can retract a warning |
| Atomic batch + `predictEntityKeys` salt | An incident appears already burned; a key rotation never leaves zero or two publishers | Create and transfer land in the same block |
| `watchEntityEvents` over WebSocket, no `fromBlock` | A new incident flips open checks to INCIDENT without a reload | Push arrived 817 ms after the write ([log](arkiv/repro-logs/ws-incident-latency.log)); polling would spend the RPC budget every judge shares |

## The model, in five rules

1. A project's **root key** (cold) signs a readonly `project` record naming its **publisher key** (hot).
2. The publisher signs readonly `endpoint` claims: a normalized target (`https://app.demo-swap.example`, `eip155:11155111:0x…`, `x:@handle`) hashed into `target_hash`, with a 30-day lease renewed on every deploy.
3. A check keeps only entities **created by** the root or the publisher. Names, slugs and labels anyone can write are displayed and never trusted.
4. New endpoints are held for **48 hours** (`PROBATION`) so a team can notice a stolen publisher key and rotate before anyone relies on what it published. Rotation is one batch: new record plus deletion of the old one. Claims by the retired key then show as `REVOKED`.
5. **Incidents only restrict.** They mark targets unsafe, never add or redirect. Their text renders without links, they are burned on creation, and anyone can keep them alive.

Verdicts: `OFFICIAL` · `PROBATION` · `INCIDENT` · `FORGED` · `REVOKED` · `UNLISTED` · `UNPINNED`. A transaction is as safe as the least safe address it authorizes. Decoded today: `approve`, `increaseAllowance`, `setApprovalForAll`, Permit2 `approve`, and EIP-2612 `Permit` typed data.

## Reproduce it

**1. Read the data without our code or servers (plain JSON-RPC):**
```bash
curl -s https://rpc.tiramisu.db-chain.testnet.arkiv.network -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"arkiv_query","params":["app = str('"'"'officially.v1'"'"') AND $creator = addr(0x04a16DA7180594eF2dFFcF70431e809432CE438F)",{"select":{"key":true,"attributes":true,"payload":true,"expiresAt":true},"limit":"0x20"}]}'
```
This returns every endpoint claim and incident Demo Swap's publisher key created. The payloads are hex-encoded JSON.

**2. The verdicts the demo shows (CLI, no wallet):**
```bash
R=0x70E5d4986A251a5173Acf59c86178e144B62864E   # Demo Swap's root key (also stated in demo/.well-known/officially.json)
npx github:Ryugi62/officially check https://app.demo-swap.example --root $R                               # OFFICIAL (PROBATION during its first 48 h)
npx github:Ryugi62/officially check eip155:11155111:0xbad0000000000000000000000000000000000bad --root $R   # FORGED
npx github:Ryugi62/officially check https://demo-swap-airdrop.example --root $R                           # INCIDENT (Demo Swap warns: fake airdrop site)
npx github:Ryugi62/officially check https://v1.demo-swap.example --root $R                                # OFFICIAL until 20 Oct 12:00 UTC, then UNLISTED (lease lapses)
```
The exact queries behind these are printed in [`/arkiv/schema.md`](arkiv/schema.md#queries-the-app-runs-exact-strings-printed-by-npx-tsx-scriptsprint-queriests).

**3. Run everything locally:**
```bash
git clone https://github.com/Ryugi62/officially && cd officially && npm ci
npx vitest run                 # unit, contract and adapter tests
npm run dev                    # the web app
npx tsx scripts/check-features.ts && npx tsx scripts/measure-latency.ts 10
```

**4. Publish for your own project** (keys come from environment variables only, never from arguments or files):
```bash
OFFICIALLY_ROOT_KEY=…      officially rotate --publisher 0xYourHotKey --slug yourproject --name "Your Project" --anchor github=https://github.com/you/repo/blob/main/.well-known/officially.json
OFFICIALLY_PUBLISHER_KEY=… officially publish --slug yourproject --endpoint "https://app.yourproject.xyz|App" --endpoint "eip155:1:0xYourRouter|Router" --chain 1
OFFICIALLY_PUBLISHER_KEY=… officially renew                                # on every deploy (CI step)
OFFICIALLY_PUBLISHER_KEY=… officially incident --target https://old.yourproject.xyz --severity 2 --title "Retired" --advice "Do not sign there." --slug yourproject
```

## Wallets that create the entities (Tiramisu)

| Address | Role |
|---|---|
| [`0x70E5d4986A251a5173Acf59c86178e144B62864E`](https://tiramisu.explorer.arkiv.network/address/0x70E5d4986A251a5173Acf59c86178e144B62864E) | Demo Swap root key: project records |
| [`0x04a16DA7180594eF2dFFcF70431e809432CE438F`](https://tiramisu.explorer.arkiv.network/address/0x04a16DA7180594eF2dFFcF70431e809432CE438F) | Demo Swap publisher key: endpoint claims, renewals, incidents |
| [`0xcb7074f79E887426Eba3aE9039F0b2ed620a8d6e`](https://tiramisu.explorer.arkiv.network/address/0xcb7074f79E887426Eba3aE9039F0b2ed620a8d6e) | Simulated attacker: a forged claim under Demo Swap's name |
| [`0x81989FF0bCd1B25b9b751c53a7266904F83B5ec2`](https://tiramisu.explorer.arkiv.network/address/0x81989FF0bCd1B25b9b751c53a7266904F83B5ec2) | Community wallet: keeps an incident alive (permissionless extension) |

Every entity, its creation transaction and its expiry: [`arkiv/evidence.md`](arkiv/evidence.md). If the public RPC rate-limits your IP (anonymous budget ≈ 100 requests), the app falls back to [`snapshot.json`](public/snapshot.json) and says so.

## Limits

- Throughput: one check is ≤ 3 RPC requests, p50 664 ms / p90 1,598 ms over 10 checks on the public RPC ([log](arkiv/repro-logs/measure-latency.log)). The anonymous RPC budget (≈ 100 requests per IP, reported-issues #17) allows about 30 checks per IP before an access key is needed.
- Trust starts with pinning the right root key (trust on first use). Officially shows the anchors the project published (`demo/.well-known/officially.json`, GitHub, ENS). Pin **before** an incident, not during one.
- Not defended: theft of the **root** key; malicious calldata that pays an official router to send funds elsewhere (only authorized addresses are decoded); chains whose wallets do not expose the request before signing.
- Tiramisu is a testnet: entities are demo data and may be reset.

## Pre-existing work, tools

- Pre-existing work: **None**. Everything was built between 12 and 18 October 2026 (first commit 12 October).
- LLMs used: Claude (Anthropic), as a coding assistant.
- License: MIT.
