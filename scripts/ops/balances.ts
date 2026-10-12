import { createPublicClient } from "@arkiv-network/sdk"
import { tiramisu } from "@arkiv-network/sdk/chains"
import { formatEther, http } from "viem"
const c = createPublicClient({ chain: tiramisu, transport: http(undefined, { retryCount: 0 }) })
for (const [r, a] of [["root","0x70E5d4986A251a5173Acf59c86178e144B62864E"],["publisher","0x04a16DA7180594eF2dFFcF70431e809432CE438F"],["community","0x81989FF0bCd1B25b9b751c53a7266904F83B5ec2"],["attacker","0xcb7074f79E887426Eba3aE9039F0b2ed620a8d6e"]] as const)
  console.log(r, a, formatEther(await c.getBalance({ address: a })))
