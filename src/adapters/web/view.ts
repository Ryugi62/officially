import type { Verdict, VerdictStatus } from "../../domain/types"
import { BLOCK_SECONDS } from "../../domain/lifetimes"

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]!)

const URLISH = /\b((?:https?:\/\/|www\.)\S+|[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|org|net|io|xyz|fi|finance|app|example|eth|co|dev|info)\b\S*)/gi
/** Incident text is shown as plain text: a stolen key must not be able to use a long-lived warning to redirect users. */
export const plainText = (s: string) => s.replace(URLISH, "[link removed]")

export type Tone = "ok" | "warn" | "no" | "idle"
export function statusCopy(status: VerdictStatus, project: string): { headline: string; tone: Tone; icon: string } {
  switch (status) {
    case "OFFICIAL":
      return { headline: `Published by ${project}'s key`, tone: "ok", icon: "✓" }
    case "PROBATION":
      return { headline: `Published by ${project}'s key less than 48 h ago — on hold`, tone: "warn", icon: "⏳" }
    case "INCIDENT":
      return { headline: `${project} raised an incident — do not sign`, tone: "no", icon: "⛔" }
    case "FORGED":
      return { headline: `Forged — claimed by a key that is not ${project}'s`, tone: "no", icon: "✕" }
    case "REVOKED":
      return { headline: `Signed by a key ${project} has retired`, tone: "no", icon: "✕" }
    case "UNLISTED":
      return { headline: `Not published by ${project}`, tone: "no", icon: "✕" }
    case "UNPINNED":
      return { headline: "Pick a project first — nobody vouches for this yet", tone: "idle", icon: "?" }
  }
}

export interface RenderCtx {
  projectName: string
  explorer: string
  now: { block: bigint; ms: number }
  /** set when the verdict comes from the published snapshot instead of a live read: never shown as a clean pass */
  snapshotBlock?: bigint
}

export function blocksToText(blocks: bigint): string {
  const s = Number(blocks) * BLOCK_SECONDS
  if (s <= 0) return "now"
  const d = Math.floor(s / 86_400)
  const h = Math.floor((s % 86_400) / 3_600)
  const m = Math.floor((s % 3_600) / 60)
  return d > 0 ? `${d} d ${h} h` : h > 0 ? `${h} h ${m} min` : `${Math.max(1, m)} min`
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
const entityLink = (ctx: RenderCtx, key: string) => `<a href="${esc(ctx.explorer)}/entity/${esc(key)}" target="_blank" rel="noopener">${esc(short(key))}</a>`
const addressLink = (ctx: RenderCtx, a: string) => `<a href="${esc(ctx.explorer)}/address/${esc(a)}" target="_blank" rel="noopener">${esc(short(a))}</a>`

/** One verdict as a card: status first, evidence folded. */
export function renderVerdict(v: Verdict, ctx: RenderCtx, role?: string): string {
  const c = statusCopy(v.status, ctx.projectName)
  const lines: string[] = []
  if (ctx.snapshotBlock !== undefined) {
    if (c.tone === "ok") c.tone = "warn"
    lines.push(`<p class="meta warn">From the published snapshot at block ${ctx.snapshotBlock}, not a live check — the RPC is rate-limiting this network. Re-check before you sign.</p>`)
  }
  if (v.status === "INCIDENT" && v.incident) {
    lines.push(`<p class="incident"><strong>${esc(plainText(v.incident.title))}</strong><br>${esc(plainText(v.incident.advice))}</p>`)
    lines.push(`<p class="meta">Severity ${v.incident.severity} · expires in ${blocksToText(v.incident.expiresAtBlock - ctx.now.block)} unless someone keeps it alive · owner ${esc(short(v.incident.owner))} (burned: nobody can delete it)</p>`)
  }
  if ((v.status === "OFFICIAL" || v.status === "PROBATION") && v.leaseExpiresAtBlock !== undefined) {
    lines.push(`<p class="meta">Lease: ${blocksToText(v.leaseExpiresAtBlock - ctx.now.block)} left — it lapses unless ${esc(ctx.projectName)} renews it.</p>`)
  }
  if (v.untrustedClaimants.length) {
    lines.push(`<p class="meta warn">${v.untrustedClaimants.length} other key${v.untrustedClaimants.length > 1 ? "s" : ""} also claim${v.untrustedClaimants.length > 1 ? "" : "s"} this: ${v.untrustedClaimants.slice(0, 3).map((a) => addressLink(ctx, a)).join(", ")}</p>`)
  }
  if (v.unverifiedWarnings.length) {
    lines.push(`<p class="meta">${v.unverifiedWarnings.length} warning(s) from keys that are not ${esc(ctx.projectName)}'s — shown, not acted on.</p>`)
  }
  const evidence: string[] = [...v.reasons.map((r) => `<li>${esc(r)}</li>`)]
  if (v.claim) evidence.push(`<li>Claim entity ${entityLink(ctx, v.claim.key)} · created by ${addressLink(ctx, v.claim.creator)} at block ${v.claim.createdAtBlock}</li>`)
  if (v.incident) evidence.push(`<li>Incident entity ${entityLink(ctx, v.incident.key)} · created by ${addressLink(ctx, v.incident.creator)}</li>`)
  evidence.push(`<li>Target hash <code>${esc(v.targetHash)}</code></li>`)
  return `<article class="verdict tone-${c.tone}" data-status="${v.status}">
  <div class="verdict-head"><span class="icon" aria-hidden="true">${c.icon}</span><div>${role ? `<div class="role">${esc(role)}</div>` : ""}<div class="target">${esc(v.target ?? "")}</div><h3>${esc(c.headline)}</h3></div></div>
  ${lines.join("\n  ")}
  <details><summary>Why</summary><ul>${evidence.join("")}</ul></details>
</article>`
}

const SEVERITY_ORDER = ["INCIDENT", "FORGED", "REVOKED", "UNLISTED", "UNPINNED", "PROBATION", "OFFICIAL"]
/** The verdict in words, naming the address role that fails — shown above the counts. */
export function txHeadline(tv: { verdict: { status: VerdictStatus }; parts: { role: string; verdict: { status: VerdictStatus } }[]; undecoded: boolean }, project: string): { text: string; tone: Tone } {
  const worst = [...tv.parts].sort((a, b) => SEVERITY_ORDER.indexOf(a.verdict.status) - SEVERITY_ORDER.indexOf(b.verdict.status))[0]
  const role = worst?.role ?? "address"
  switch (tv.verdict.status) {
    case "INCIDENT": return { text: `Do not sign: ${project} raised an incident on the ${role}`, tone: "no" }
    case "FORGED": return { text: `Do not sign: the ${role} is forged`, tone: "no" }
    case "REVOKED": return { text: `Do not sign: the ${role} was published by a key ${project} retired`, tone: "no" }
    case "UNLISTED": return { text: `Do not sign: the ${role} was not published by ${project}`, tone: "no" }
    case "UNPINNED": return { text: "Pick a project first — nobody vouches for this yet", tone: "idle" }
    case "PROBATION": return { text: `Wait: the ${role} was published less than 48 h ago`, tone: "warn" }
    case "OFFICIAL":
      return tv.undecoded
        ? { text: "The contract checks out, but what this call authorizes was not decoded — do not treat it as safe", tone: "warn" }
        : { text: `Safe to sign: every address was published by ${project}`, tone: "ok" }
  }
}
