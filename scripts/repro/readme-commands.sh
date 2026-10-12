#!/bin/sh
# Runs the CLI commands quoted in README "Reproduce it" and prints their verdicts (no wallet needed).
R=0x70E5d4986A251a5173Acf59c86178e144B62864E
run() { echo "\$ officially $*"; node bin/officially.mjs "$@"; echo "exit=$?"; echo; }
run check-tx --chain 11155111 --origin https://app.demo-swap.example --to 0x5eed00000000000000000000000000000000aaaa --data 0x095ea7b3000000000000000000000000bad0000000000000000000000000000000000bad00000000000000000000000000000000000000000000000000000000000003e8 --root $R
run check https://app.demo-swap.example --root $R
run check eip155:11155111:0xbad0000000000000000000000000000000000bad --root $R
run check https://demo-swap-airdrop.example --root $R
run check https://v1.demo-swap.example --root $R
run check https://docs.demo-swap.example --root $R
echo "\$ node examples/independent-check.mjs https://demo-swap-airdrop.example $R"; node examples/independent-check.mjs https://demo-swap-airdrop.example $R
