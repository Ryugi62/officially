// AC-14 live incidents over a real WebSocket, no fromBlock (which would force polling)
import { describe, expect, it } from "vitest"
import { createFeedClient, ArkivIncidentFeed } from "../../src/adapters/arkiv/feed"
import { PUB_A, EVIL } from "../fixtures"

describe("ArkivIncidentFeed (UC-7, AC-14)", () => {
  it("builds its client on a WebSocket transport", () => {
    const client = createFeedClient("wss://rpc.tiramisu.db-chain.testnet.arkiv.network")
    expect(client.transport.type).toBe("webSocket")
  })
  it("subscribes without fromBlock and forwards only incidents created by trusted keys", async () => {
    let params: Record<string, unknown> | undefined
    const fake = {
      watchEntityEvents(p: Record<string, unknown>) {
        params = p
        return () => {}
      },
    }
    const seen: string[] = []
    const lookups: string[] = []
    const feed = new ArkivIncidentFeed(fake, async (key) => {
      lookups.push(key)
      return key.endsWith("1") ? { type: "incident", creator: PUB_A } : { type: "incident", creator: EVIL }
    })
    feed.subscribe([PUB_A], (k) => seen.push(k))
    expect(params).toBeDefined()
    expect("fromBlock" in params!).toBe(false)
    const onCreated = params!.onEntityCreated as (e: { entityKey: string; owner: string }) => void
    onCreated({ entityKey: "0x" + "0".repeat(63) + "1", owner: PUB_A })
    onCreated({ entityKey: "0x" + "0".repeat(63) + "2", owner: EVIL })
    await new Promise((r) => setTimeout(r, 10))
    expect(seen).toEqual(["0x" + "0".repeat(63) + "1"])
  })
})
