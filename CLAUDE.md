# Agent Guide

This repository is a public, chainlist-aware registry of blob-submitting EVM address attributions. Keep changes evidence-backed, deterministic, and additive.

## Core Rules

- Do not add attribution claims without public evidence.
- Do not invent chain metadata. Chain IDs, names, RPCs, explorers, currencies, icons, and related chain metadata belong to `ethereum-lists/chains`. The one exception is entity icons: a local SVG under `icons/local/` may serve as a fallback while Chainlist has no icon for the entity's chain; resolution automatically prefers the Chainlist icon once one exists upstream (see `icons/local/README.md`).
- Keep one source YAML file per entity in `entities/`, with the filename matching the entity `id`.
- Preserve history by closing ranges with `valid_to.block` instead of rewriting past claims.
- Use `confidence: confirmed` only for strong evidence such as official docs, official announcements, verified contracts, official repositories, or equivalent public sources.
- Use `probable`, `inferred`, or `disputed` when evidence is weaker or contested.

## Common Commands

```sh
npm ci
npm run fetch-chainlist
npm run generate
npm run format:check
npm run lint:md
npm run validate
npm run generate:check
npm audit --audit-level=moderate
```

Run `npm run fetch-chainlist` and `npm run generate` after changing `entities/`, schemas, the vendored Chainlist snapshot lockfile, or generator logic. Attribution PRs should not commit `data/chainlist/snapshot.json` or `artifacts/` changes; CI regenerates and validates them. Generated artifacts are not committed — they are published on GitHub Releases and consumed from the latest release URL.

## Data Model Notes

- `submission_chain` and all chain references use CAIP-2 refs such as `eip155-1`.
- `data/chainlist/snapshot.json` is a vendored Chainlist lockfile for deterministic validation and generation; it is not registry-owned chain metadata.
- EVM addresses must be checksummed.
- Every address claim needs at least one evidence item.
- `valid_to: null` means the claim is open-ended.
- The overlap rule is enforced: the same `submission_chain + address + role` cannot map to two active non-disputed entities over overlapping block ranges.

## Repository Hygiene

- Keep `AGENTS.md` as a symlink to this file.
- Prefer small PRs with focused attribution or tooling changes.
- The protected `main` branch requires a PR and the `validate` CI check; approving reviews are not platform-enforced.
- The `at/refresh-chainlist-snapshot` automation PR auto-merges once `validate` passes; attribution and tooling PRs still get human review before merge.
- Do not bypass branch protection for ordinary changes.
