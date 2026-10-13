#!/bin/sh
# Looks for a second public Arkiv RPC for Tiramisu (chain 7738577). Three paths, results printed as-is.
echo "## path 1: the three places a node URL is published (docs page, SDK chain definition, chain registries)"
echo "docs.arkiv.network/networks/tiramisu/ mentions:"; curl -s -m 10 https://docs.arkiv.network/networks/tiramisu/ | grep -oE '[a-z0-9.-]+\.arkiv\.network[^" <)]*' | grep -E 'rpc|wss|node' | sort -u
echo "SDK dist mentions:"; grep -rhoE 'https?://[A-Za-z0-9./_-]*rpc[A-Za-z0-9./_-]*' node_modules/@arkiv-network/sdk/dist | grep -v ethereum.org | sort -u
echo "chainlist.org entries for 7738577:"; curl -s -m 10 https://chainlist.org/rpcs.json | python3 -c "import sys,json;print([c['name'] for c in json.load(sys.stdin) if c['chainId']==7738577])"
echo "ethereum-lists/chains eip155-7738577.json:"; curl -s -m 10 -o /dev/null -w '%{http_code}\n' https://raw.githubusercontent.com/ethereum-lists/chains/master/_data/chains/eip155-7738577.json
echo "## path 2: guessed hostnames (eth_blockNumber POST; 000 = no DNS/connection)"
for h in https://tiramisu.db-chain.testnet.arkiv.network https://rpc2.tiramisu.db-chain.testnet.arkiv.network https://rpc.tiramisu.arkiv.network https://tiramisu.hoodi.arkiv.network/rpc; do echo "$h -> $(curl -s -m 8 -o /dev/null -w '%{http_code}' -X POST $h -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}')"; done
echo "## path 3: the explorer's own API (does it proxy JSON-RPC?)"
for h in https://tiramisu.explorer.arkiv.network/api/eth-rpc https://tiramisu.explorer.arkiv.network/api/v2/stats; do echo "$h -> $(curl -s -m 8 -o /dev/null -w '%{http_code}' -X POST $h -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}')"; done
