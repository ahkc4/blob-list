# Local Icons

Local icons are fallbacks. An entity's `icon` block may carry a Chainlist
`chain_ref`, a `local` SVG, or both; resolution always prefers the Chainlist
icon when the referenced chain has one upstream in `ethereum-lists/chains`.
The local file is only used while Chainlist has no icon for that chain, so
when one appears upstream the registry switches to it automatically on the
next snapshot refresh. Prefer contributing icons upstream when the chain is
listed there.

Local icons must be SVG files, must not contain scripts, foreign objects,
remote references, data URLs, or embedded raster data, must stay under
100 KiB, and must include `license` and `source_url` metadata in the entity
YAML. Name each file after the entity id it serves; entities that share a
brand (for example a testnet and its mainnet) may reference the same file.
