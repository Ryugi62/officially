#!/bin/sh
# Re-verifies the 12 Oct key rotation on Tiramisu from public data only. No keys.
U=https://rpc.tiramisu.db-chain.testnet.arkiv.network
T=0x34ac5dc20adf43f81048c2a558c5aa455f2087b40b20e87c9abd8beb9d286df4
echo "## rotation transaction (one batch: create new project record + delete old one)"
curl -s $U -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"eth_getTransactionReceipt","params":["'$T'"]}' | python3 -c "
import sys,json;r=json.load(sys.stdin)['result'];print('status',int(r['status'],16),'block',int(r['blockNumber'],16),'from',r['from'],'logs',len(r['logs']))"
echo "## verdicts (root pinned out of band)"
R=0x70E5d4986A251a5173Acf59c86178e144B62864E
node bin/officially.mjs check https://docs.demo-swap.example --root $R    # left on the retired key on purpose: REVOKED
node bin/officially.mjs check https://app.demo-swap.example --root $R     # re-published by publisher-v2
