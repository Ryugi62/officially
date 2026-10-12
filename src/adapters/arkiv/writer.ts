import type { PublicArkivClient, WalletArkivClient } from "@arkiv-network/sdk"
import type { AttestationWriter, WriteBatch } from "../../application/ports"
import type { Address, Hex } from "../../domain/types"
import { toSdkBatch } from "./codec"

export class ArkivWriter implements AttestationWriter {
  constructor(
    private readonly wallet: WalletArkivClient,
    private readonly reader: PublicArkivClient,
  ) {}

  get address(): Address {
    const a = this.wallet.account?.address
    if (!a) throw new Error("Wallet client has no account")
    return a
  }

  async predictKeys(count: number) {
    const keys = await this.reader.predictEntityKeys({ owner: this.address, count })
    return keys.map((k) => ({ key: k.key, salt: k.salt }))
  }

  async submit(batch: WriteBatch): Promise<{ txHash: Hex; created: Hex[] }> {
    const res = await this.wallet.executeBatch(toSdkBatch(batch))
    return { txHash: res.txHash, created: res.createdEntities }
  }
}
