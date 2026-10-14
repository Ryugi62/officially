import type { AnchorFetcher } from "../../application/confirm-root"

export const ENS_TEXT_KEY = "officially.rootKey"
const HEX40 = /^0x[0-9a-fA-F]{40}$/

/** Port: read one ENS text record. Production uses viem against an ENS-enabled chain (Sepolia); tests pass a fake. */
export interface EnsTextResolver {
  text(name: string, key: string): Promise<string | null | undefined>
}

/** `ens:<name>` anchors: the name's `officially.rootKey` text record, wrapped as the same JSON an https anchor serves. Anything else reads as absent. */
export class EnsAnchorFetcher implements AnchorFetcher {
  constructor(private readonly resolver: EnsTextResolver) {}
  async fetchText(ref: string): Promise<string | undefined> {
    if (!ref.startsWith("ens:")) return undefined
    const v = (await this.resolver.text(ref.slice(4), ENS_TEXT_KEY))?.trim()
    return v && HEX40.test(v) ? JSON.stringify({ officially: { rootKey: v } }) : undefined
  }
}

/** ens: refs go to ENS, everything else to the HTTPS fetcher. */
export class RoutingAnchorFetcher implements AnchorFetcher {
  constructor(private readonly ens: AnchorFetcher, private readonly http: AnchorFetcher) {}
  fetchText(ref: string) {
    return (ref.startsWith("ens:") ? this.ens : this.http).fetchText(ref)
  }
}
