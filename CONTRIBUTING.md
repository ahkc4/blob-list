# Contributing

Thanks for helping make blob attribution less hand-wavy.

## Add Or Update An Entity

1. Add or edit one YAML file under `entities/`.
2. Keep the filename equal to the entity `id`.
3. Add at least one evidence item for every address claim.
4. Use `confidence: confirmed` only when the evidence is official documentation, an official announcement, a verified contract, an official repository, or similarly strong public evidence.
5. Close historical ranges with `valid_to.block` instead of rewriting past claims.
6. Do not include `data/chainlist/snapshot.json` or generated `artifacts/` changes in attribution PRs; CI regenerates and validates them, and artifacts are published on GitHub Releases rather than committed.

## Address Rules

- `submission_chain` must be a known CAIP-2 ref from the pinned Chainlist snapshot lockfile.
- `address` must be a checksummed EVM address.
- `valid_to: null` means the claim is currently open-ended.
- The same `submission_chain + address + role` cannot map to two active, non-disputed entities over overlapping block ranges.

## Icons

- Give an entity an `icon` block when a usable mark exists; both fields are optional but at least one is required.
- `chain_ref` points at the CAIP-2 chain whose Chainlist entry carries the icon. Resolution always prefers the Chainlist icon when the chain has one upstream in `ethereum-lists/chains`.
- `local` supplies a fallback SVG under `icons/local/` (with `license` and `source_url`) for chains Chainlist has no icon for. It is used only until an upstream icon appears; see `icons/local/README.md` for the file rules.
- Icons must render legibly standalone on both light and dark backgrounds; marks that rely on page CSS (for example `currentColor`) or on a specific page background are normalized before being committed.

## Local Checks

```sh
npm ci
npm run fetch-chainlist
npm run generate
npm run format:check
npm run lint:md
npm run validate
npm run generate:check
```

If you add a new chain reference, you may run `npm run fetch-chainlist` locally before validation, but do not commit the resulting `data/chainlist/snapshot.json` change in attribution PRs. CI refetches that snapshot for validation, and the scheduled Chainlist refresh keeps the vendored lockfile current. Do not edit the snapshot by hand or add chain metadata to entity YAML; chain facts belong upstream in Chainlist.

## Evidence Guidance

Good evidence is public, durable, and specific. Prefer official docs, official repos, verified contracts, and transaction hashes. Dashboards and explorer labels are useful, but usually justify `probable` or `inferred` rather than `confirmed`.
