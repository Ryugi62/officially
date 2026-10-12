import type { Address } from "./types"

// Arkiv counts lifetimes in 2-second blocks; every value here is a whole number of blocks.
const DAY = 24 * 60 * 60

/** A project record names who may publish for the project. Long-lived, replaced on rotation. */
export const PROJECT_RECORD_SECONDS = 365 * DAY
/** An endpoint stays official only while the publisher keeps renewing it (Lifetime Extension). */
export const ENDPOINT_LEASE_SECONDS = 30 * DAY
/** A warning lives 72 hours unless someone — anyone — keeps it alive. */
export const INCIDENT_SECONDS = 72 * 60 * 60
/** How long a warning lives by severity: 1 caution 24 h, 2 do-not-sign 72 h, 3 compromised 7 days. Keep-alive restarts the same clock. */
export const incidentSeconds = (severity: number) => (severity >= 3 ? 7 * DAY : severity === 2 ? INCIDENT_SECONDS : DAY)

/** Incidents are handed to this address in the batch that creates them: no key can delete them afterwards. */
export const BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD" as Address

export const BLOCK_SECONDS = 2

/** New endpoints are held this long (48 h of 2-second blocks) before they count as official. */
export const PROBATION_BLOCKS = 86_400n
