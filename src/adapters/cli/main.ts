import { createPublicClient, createWalletClient } from "@arkiv-network/sdk"
import { tiramisu } from "@arkiv-network/sdk/chains"
import { http } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { checkTarget } from "../../application/check-target"
import { checkTransaction } from "../../application/check-transaction"
import { keepAlive, publishEndpoints, raiseIncident, renewLeases, rotatePublisher } from "../../application/writes"
import type { Address, Anchor, Hex, Verdict } from "../../domain/types"
import { ArkivReader } from "../arkiv/reader"
import { createFeedClient, watchKeys } from "../arkiv/feed"
import { ArkivWriter } from "../arkiv/writer"
import { exitCodeFor, parseArgs, type Args } from "./args"

const HELP = `officially — check that what you are about to trust was published by a project's own key (Arkiv, Tiramisu testnet)

Read (no wallet):
  officially check <link|@handle|0xaddress|eip155:chain:0xaddress> --root <projectRootKey> [--chain <id>] [--json]
  officially check-tx --to <0x> --data <0x…> --chain <id> [--origin <url>] --root <projectRootKey> [--json]
  officially projects [--json]
  officially watch --root <projectRootKey>   live: prints every entity the project's keys create (run it on the team side:
                                             a new endpoint nobody published = stolen publisher key; rotate within the 48 h hold)

Write (keys from environment variables, never from arguments):
  OFFICIALLY_PUBLISHER_KEY  officially publish --slug <slug> --endpoint "<target>|<label>" [--endpoint …] [--chain <id>]
  OFFICIALLY_PUBLISHER_KEY  officially renew
  OFFICIALLY_PUBLISHER_KEY  officially incident (--target <t> | --project-wide) --severity 1|2|3 --title <t> --advice <a> --slug <slug>
  OFFICIALLY_KEY            officially keep-alive <incidentKey>        (any funded wallet; reads the incident, never shortens it)
  OFFICIALLY_ROOT_KEY       officially rotate --publisher <0x> --slug <slug> --name <name> [--anchor github=<url>] [--compromised-since <block>]

Exit code 0 = OFFICIAL, 1 = anything else, 2 = error.`

const reader = () => new ArkivReader(createPublicClient({ chain: tiramisu, transport: http(process.env.OFFICIALLY_RPC, { retryCount: 0 }) }))

function writer(envName: string) {
  const key = process.env[envName]
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error(`Set ${envName} to a funded Tiramisu test key (0x + 64 hex). It is read from the environment only.`)
  const account = privateKeyToAccount(key as Hex)
  const transport = http(process.env.OFFICIALLY_RPC, { retryCount: 0 })
  return new ArkivWriter(createWalletClient({ chain: tiramisu, transport, account }), createPublicClient({ chain: tiramisu, transport }))
}

const str = (a: Args, k: string) => {
  const v = a.flags[k]
  if (typeof v !== "string") throw new Error(`--${k} is required`)
  return v
}
const opt = (a: Args, k: string) => (typeof a.flags[k] === "string" ? (a.flags[k] as string) : undefined)
const big = (_: string, v: unknown) => (typeof v === "bigint" ? v.toString() : v)

function printVerdict(v: Verdict, label?: string) {
  console.log(`${label ? `${label.padEnd(9)} ` : ""}${v.status.padEnd(9)} ${v.target ?? ""}`)
  for (const r of v.reasons) console.log(`          ${r}`)
}

export async function main(argv: string[]): Promise<number> {
  const a = parseArgs(argv)
  const json = a.flags.json === true
  switch (a.cmd) {
    case "help":
      console.log(HELP)
      return 0
    case "check": {
      const target = a.positional[0]
      if (!target) throw new Error("check needs a target")
      const chain = opt(a, "chain")
      const root = opt(a, "root")
      const v = await checkTarget(reader(), { raw: target, ...(chain && { chainId: Number(chain) }), ...(root && { pin: { rootKey: root as Address } }) })
      json ? console.log(JSON.stringify(v, big, 2)) : printVerdict(v)
      return exitCodeFor(v.status)
    }
    case "check-tx": {
      const origin = opt(a, "origin")
      const root = opt(a, "root")
      const tv = await checkTransaction(reader(), {
        request: { to: str(a, "to"), data: str(a, "data"), chainId: Number(str(a, "chain")) },
        ...(origin && { origin }),
        ...(root && { pin: { rootKey: root as Address } }),
      })
      if (json) console.log(JSON.stringify(tv, big, 2))
      else {
        console.log(`TRANSACTION ${tv.verdict.status}${tv.undecoded ? " (calldata not decoded — only the contract was checked)" : ""}`)
        for (const p of tv.parts) printVerdict(p.verdict, p.role)
      }
      return tv.undecoded ? 1 : exitCodeFor(tv.verdict.status)
    }
    case "watch": {
      const root = str(a, "root") as Address
      const r = reader()
      const recs = await r.findProjectRecords(root)
      const keys = [root, ...recs.map((x) => x.publisher)]
      const pub = createPublicClient({ chain: tiramisu, transport: http(process.env.OFFICIALLY_RPC, { retryCount: 0 }) })
      console.log(`watching ${keys.length} key(s) of root ${root} over a WebSocket — Ctrl-C to stop`)
      watchKeys(createFeedClient(), async (key) => {
        const e = await pub.getEntity(key)
        const type = (e.attributes as Record<string, { value?: unknown }> | undefined)?.type?.value
        return e.creator ? { type: String(type), creator: e.creator } : undefined
      }, keys, (e) => console.log(`${new Date().toISOString()} NEW ${e.type.padEnd(8)} ${e.key} by ${e.creator}${e.type === "endpoint" ? "  <- did your team publish this? If not: rotate the publisher now (48 h hold)" : ""}`),
      (err) => console.error(`feed error: ${err.message}`))
      await new Promise(() => {})
      return 0
    }
    case "projects": {
      const r = reader()
      let cursor: string | undefined
      const rows: unknown[] = []
      do {
        const page = await r.listProjects(cursor)
        for (const p of page.records) {
          rows.push(p)
          if (!json) console.log(`${p.creator}  ${p.slug.padEnd(20)} publisher ${p.publisher}  "${p.name}"`)
        }
        cursor = page.cursor
      } while (cursor)
      if (json) console.log(JSON.stringify(rows, big, 2))
      return 0
    }
    case "publish": {
      const chain = opt(a, "chain")
      const endpoints = (a.multi.endpoint ?? []).map((e) => {
        const [raw, label = ""] = e.split("|")
        return { raw: raw!, label, ...(chain && { chainId: Number(chain) }) }
      })
      if (!endpoints.length) throw new Error("publish needs at least one --endpoint")
      const r = await publishEndpoints(writer("OFFICIALLY_PUBLISHER_KEY"), { projectSlug: str(a, "slug"), endpoints })
      console.log(JSON.stringify(r, big, 2))
      return 0
    }
    case "renew": {
      const r = await renewLeases(writer("OFFICIALLY_PUBLISHER_KEY"), reader())
      console.log(JSON.stringify(r, big, 2))
      return 0
    }
    case "incident": {
      const chain = opt(a, "chain")
      const r = await raiseIncident(writer(process.env.OFFICIALLY_ROOT_KEY && a.flags["project-wide"] ? "OFFICIALLY_ROOT_KEY" : "OFFICIALLY_PUBLISHER_KEY"), {
        raw: a.flags["project-wide"] ? undefined : str(a, "target"),
        ...(chain && { chainId: Number(chain) }),
        severity: Number(str(a, "severity")),
        title: str(a, "title"),
        advice: str(a, "advice"),
        projectSlug: str(a, "slug"),
      })
      console.log(JSON.stringify(r, big, 2))
      return 0
    }
    case "keep-alive": {
      const key = a.positional[0]
      if (!key) throw new Error("keep-alive needs an incident key")
      console.log(JSON.stringify(await keepAlive(writer("OFFICIALLY_KEY"), { incidentKey: key as Hex }, reader()), big, 2))
      return 0
    }
    case "rotate": {
      const anchors: Anchor[] = (a.multi.anchor ?? []).map((s) => {
        const [kind, ...ref] = s.split("=")
        return { kind: kind as Anchor["kind"], ref: ref.join("=") }
      })
      const r = await rotatePublisher(writer("OFFICIALLY_ROOT_KEY"), reader(), {
        newPublisher: str(a, "publisher") as Address,
        slug: str(a, "slug"),
        name: str(a, "name"),
        anchors,
        ...(opt(a, "compromised-since") && { compromisedSinceBlock: BigInt(opt(a, "compromised-since")!) }),
      })
      console.log(JSON.stringify(r, big, 2))
      return 0
    }
  }
}
