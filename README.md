# Officially

**Before you sign, check that the address you are approving was published by the project's own key — straight from Arkiv, no server in between.**

A hijacked frontend (DNS takeover, hacked X account) can change everything on the page except the project's key. Officially decodes what your wallet is asked to approve (contract, spender, operator), and checks each address, plus the site asking, against entities on [Arkiv](https://arkiv.network) whose immutable `$creator` is the project's key.

> Work in progress for **Arkiv: Global Tour Stop** (9–18 October 2026). Full README, live app link, evidence and demo video land before submission.

- Data contract: [`/arkiv/schema.md`](arkiv/schema.md)
- Friction report: [`/arkiv/friction.md`](arkiv/friction.md)
- Spec: [`SPEC.md`](SPEC.md)

## Run it

```bash
npm ci
npx vitest run          # tests
npm run dev             # web app on localhost
node bin/officially.mjs check https://app.demo-swap.example --root 0x70E5d4986A251a5173Acf59c86178e144B62864E
```

All demo data is synthetic (`*.example` domains, made-up addresses). MIT licensed.
