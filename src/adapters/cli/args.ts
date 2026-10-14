import type { VerdictStatus } from "../../domain/types"

export const COMMANDS = ["check", "check-tx", "watch", "projects", "publish", "renew", "incident", "keep-alive", "rotate", "help"] as const
export type Command = (typeof COMMANDS)[number]
const MULTI = new Set(["endpoint", "anchor", "anchor-url"])
const BOOL = new Set(["json", "project-wide", "help"])

export interface Args {
  cmd: Command
  positional: string[]
  flags: Record<string, string | true>
  multi: Record<string, string[]>
}

export function parseArgs(argv: string[]): Args {
  const [cmd = "help", ...rest] = argv
  if (!(COMMANDS as readonly string[]).includes(cmd)) throw new Error(`Unknown command: ${cmd}. Try: ${COMMANDS.join(", ")}`)
  const out: Args = { cmd: cmd as Command, positional: [], flags: {}, multi: {} }
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!
    if (!a.startsWith("--")) {
      out.positional.push(a)
      continue
    }
    const name = a.slice(2)
    if (BOOL.has(name)) {
      out.flags[name] = true
      continue
    }
    const v = rest[++i]
    if (v === undefined) throw new Error(`--${name} needs a value`)
    if (MULTI.has(name)) (out.multi[name] ??= []).push(v)
    else out.flags[name] = v
  }
  return out
}

/** 0 = safe to rely on; 1 = do not rely on it. Lets a CI step or a script gate on the verdict. */
export const exitCodeFor = (s: VerdictStatus) => (s === "OFFICIAL" ? 0 : 1)
