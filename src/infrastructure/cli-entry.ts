import { main } from "../adapters/cli/main"

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(`error: ${e instanceof Error ? e.message : String(e)}`)
    process.exit(2)
  },
)
