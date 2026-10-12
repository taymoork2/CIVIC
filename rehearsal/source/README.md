# Rehearsal development host

See ../README.md and ../HANDOFF.md for setup, ownership and unfinished extraction. Product direction and contracts are in docs/design/review-product/.

```sh
pnpm install --frozen-lockfile
pnpm --dir apps/web run review
```

Open http://127.0.0.1:3010/review. No review key, production backend or model account is required. Use the project picker to connect/generate previews; provider-dependent states remain gaps.

