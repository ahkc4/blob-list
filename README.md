# blob-list

`blob-list` is a public, evidence-backed registry that maps blob-submitting EVM addresses to entities. It is additive to [`ethereum-lists/chains`](https://github.com/ethereum-lists/chains): chain metadata, RPC URLs, explorers, currencies, and parent-chain relationships remain there, while this repo focuses only on attribution claims.

The registry is intended for blob explorers, dashboards, wallets, researchers, and data pipelines that need to answer: "Which entity submitted this blob transaction sender at this block?"

## What Is In Scope

- Blob-submitting EVM addresses, grouped by entity.
- Block-range validity for each attribution.
- Evidence for every address claim.
- Chain references using CAIP-2 IDs such as `eip155-1`.
- Evidence-backed social accounts for each entity (X, Farcaster, and any platform added to the registry later).
- Entities that are not necessarily chains, including infrastructure providers, bridges, exchanges, research users, and individuals.

## Layout

```text
entities/          Source YAML, one file per entity.
schemas/           JSON Schemas for source and generated artifacts.
tools/             Fetch, validate, and generate scripts.
data/chainlist/    Vendored Chainlist lockfile snapshot used by CI and releases.
artifacts/         Generated JSON artifacts (published on GitHub Releases; not committed).
icons/local/       Local icons only for entities not represented by Chainlist.
```

## Chainlist Snapshot

`data/chainlist/snapshot.json` is a vendored lockfile for the subset of
Chainlist entries referenced by source YAML. It exists to keep local validation,
CI, and release generation deterministic; it is not registry-owned chain
metadata. If chain facts drift upstream, refresh the snapshot with
`npm run fetch-chainlist` or let the scheduled refresh workflow open a PR.

## Using The Generated Data

Generated artifacts are **not committed to this repository**. They are published
as assets on each GitHub Release, so consumers should fetch them from the latest
release URL. GitHub serves the newest published release at a stable
`releases/latest/download/` path:

```sh
# Full registry
curl -L -o registry.json \
  https://github.com/tirante-dev/blob-list/releases/latest/download/registry.json

# Minified registry
curl -L -o registry.min.json \
  https://github.com/tirante-dev/blob-list/releases/latest/download/registry.min.json

# Entities, icon metadata, and social accounts
curl -L https://github.com/tirante-dev/blob-list/releases/latest/download/entities.json
curl -L https://github.com/tirante-dev/blob-list/releases/latest/download/icons.json
curl -L https://github.com/tirante-dev/blob-list/releases/latest/download/social.json

# Per-chain slice (asset name is the CAIP-2 ref, e.g. eip155-1)
curl -L https://github.com/tirante-dev/blob-list/releases/latest/download/eip155-1.json

# Checksums for the release assets
curl -L https://github.com/tirante-dev/blob-list/releases/latest/download/SHA256SUMS
```

To pin to a specific dataset version, swap `latest/download` for
`download/<tag>` (for example `download/v1.4.0`). Browse published releases at
<https://github.com/tirante-dev/blob-list/releases>.

## Consumer Lookup

1. Fetch `eip155-1.json` (the `{submission_chain}` slice) from the latest release.
2. Normalize the transaction sender to a checksummed EVM address.
3. Find address claims for that sender.
4. Filter claims by block number.
5. Prefer active, non-disputed, highest-confidence claims.
6. Display the entity name, role, confidence, chain refs, icon metadata, and social accounts.

## Social Accounts

Entities carry a `social` list of accounts. Each source entry stores only the
platform id and the bare handle; profile URLs are derived at generation time
from the platform registry in
[`tools/lib/social-platforms.js`](tools/lib/social-platforms.js), so a handle is
recorded exactly once and can never drift from its link.

Resolved accounts appear on every entity in `entities.json`, `registry.min.json`,
and the per-chain slices, and are also published on their own in `social.json`:

```json
{
  "platforms": {
    "x": {
      "handle_pattern": "^[A-Za-z0-9_]{1,15}$",
      "handle_prefix": "@",
      "name": "X",
      "url_template": "https://x.com/{handle}"
    }
  },
  "social": {
    "linea": [
      {
        "display": "@linea",
        "handle": "linea",
        "platform": "farcaster",
        "platform_name": "Farcaster",
        "url": "https://farcaster.xyz/linea"
      }
    ]
  }
}
```

`social.json` ships the platform directory alongside the accounts so consumers
can render or re-validate handles for platforms added after they shipped,
without a code change on their side.

## Development

```sh
npm ci
npm run fetch-chainlist
npm run generate
npm run validate
```

Before opening a pull request, run:

```sh
npm run format:check
npm run lint:md
npm run generate
npm run validate
npm run generate:check
```

Pull request CI regenerates artifacts from the submitted source files and
validates them. Attribution PRs should include source YAML, schemas, docs, or
icons only; CI rejects committed `data/chainlist/snapshot.json` changes in
attribution PRs and rejects committed `artifacts/` changes. Generated artifacts
are not stored in the repository — they are published on GitHub Releases (see
[Using The Generated Data](#using-the-generated-data)).

## Releases

Dataset releases use semver-style tags. Merges to `main` that add one or
more address attribution claims automatically publish the next minor release.
Manual tag pushes matching `v*.*.*` can still publish explicit releases for
schema changes or patch fixes.

- Major: schema changes.
- Minor: new entities, chains, or attribution claims.
- Patch: metadata, evidence, typo, or icon fixes.

Release artifacts include generated JSON files and SHA256 checksums.
