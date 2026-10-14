import type { AnchorFetcher } from "../../application/confirm-root"

const MAX_BYTES = 64 * 1024

/** HTTPS GET with a 10 s timeout and a 64 KB cap. Redirects are followed by fetch; the result is only compared, never executed. */
export class HttpAnchorFetcher implements AnchorFetcher {
  async fetchText(url: string): Promise<string | undefined> {
    if (!url.startsWith("https://")) return undefined
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000), headers: { accept: "application/json,text/plain" } })
    if (!res.ok) return undefined
    const text = await res.text()
    return text.length > MAX_BYTES ? undefined : text
  }
}
