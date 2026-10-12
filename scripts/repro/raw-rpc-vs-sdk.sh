#!/bin/sh
# Same questions asked of the node directly (JSON-RPC) that the SDK query builder refuses client-side.
RPC=https://rpc.tiramisu.db-chain.testnet.arkiv.network
q() { echo "## $1"; curl -s "$RPC" -H 'content-type: application/json' -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"arkiv_query\",\"params\":[\"$2\",{\"limit\":\"0x2\",\"select\":{\"key\":true,\"createdAt\":true}}]}" | head -c 400; echo; }
q '$createdAt filter (SDK: InvalidPredicateError)' "app = str('officially.v1') AND \$createdAt > u64(460000)"
q 'match everything * (SDK: InvalidPredicateError)' '*'
q 'control: $creator filter (SDK accepts)' "app = str('officially.v1') AND \$creator = addr(0x70E5d4986A251a5173Acf59c86178e144B62864E)"
