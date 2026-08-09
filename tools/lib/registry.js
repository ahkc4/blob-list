import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import YAML from "js-yaml";
import {
  SOCIAL_PLATFORMS,
  socialDisplay,
  socialPlatformDirectory,
  socialProfileUrl,
} from "./social-platforms.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const rootDir = path.resolve(__dirname, "../..");
export const entitiesDir = path.join(rootDir, "entities");
export const artifactsDir = path.join(rootDir, "artifacts");
export const chainlistSnapshotFile = path.join(
  rootDir,
  "data/chainlist/snapshot.json",
);

export const STRONG_EVIDENCE_TYPES = new Set([
  "documentation",
  "announcement",
  "verified_contract",
  "repository",
]);

export const CONFIDENCE_RANK = {
  disputed: 0,
  inferred: 1,
  probable: 2,
  confirmed: 3,
};

export async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

export async function writeJson(file, value, { compact = false } = {}) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const sorted = sortObject(value);
  let json;
  if (compact) {
    json = `${JSON.stringify(sorted)}\n`;
  } else {
    // Committed JSON must satisfy `npm run format:check`; JSON.stringify
    // disagrees with prettier on short arrays, so format with the repo's
    // prettier (a devDependency, hence the lazy import).
    const { default: prettier } = await import("prettier");
    const config = await prettier.resolveConfig(file);
    json = await prettier.format(JSON.stringify(sorted, null, 2), {
      ...config,
      filepath: file,
    });
  }
  await fs.writeFile(file, json);
}

export function canonicalJson(value, { compact = false } = {}) {
  const sorted = sortObject(value);
  return compact
    ? `${JSON.stringify(sorted)}\n`
    : `${JSON.stringify(sorted, null, 2)}\n`;
}

export function sortObject(value) {
  if (Array.isArray(value)) {
    return value.map(sortObject);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortObject(value[key])]),
    );
  }
  return value;
}

export async function loadEntities() {
  const files = (await fs.readdir(entitiesDir))
    .filter((file) => /\.ya?ml$/u.test(file))
    .sort();
  const entities = [];
  for (const file of files) {
    const absolutePath = path.join(entitiesDir, file);
    const parsed = YAML.load(await fs.readFile(absolutePath, "utf8"));
    entities.push({ ...parsed, __file: absolutePath });
  }
  return entities.sort((a, b) => a.id.localeCompare(b.id));
}

export async function loadChainlistSnapshot() {
  return readJson(chainlistSnapshotFile);
}

export async function loadSchemas() {
  const schemaDir = path.join(rootDir, "schemas");
  return {
    chainArtifact: await readJson(
      path.join(schemaDir, "chain-artifact.schema.json"),
    ),
    entity: await readJson(path.join(schemaDir, "entity.schema.json")),
    registryArtifact: await readJson(
      path.join(schemaDir, "registry-artifact.schema.json"),
    ),
  };
}

export function makeAjv() {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv;
}

export function stripInternal(entity) {
  const { __file, ...rest } = entity;
  return rest;
}

export function normalizeAddress(address) {
  const lower = address.toLowerCase().replace(/^0x/u, "");
  if (!/^[0-9a-f]{40}$/u.test(lower)) {
    throw new Error(`Invalid EVM address: ${address}`);
  }
  const hash = bytesToHex(keccak_256(new TextEncoder().encode(lower)));
  let checksummed = "0x";
  for (let i = 0; i < lower.length; i += 1) {
    checksummed +=
      Number.parseInt(hash[i], 16) >= 8 ? lower[i].toUpperCase() : lower[i];
  }
  return checksummed;
}

export function collectReferencedChains(entities) {
  const refs = new Set(["eip155-1"]);
  for (const entity of entities) {
    for (const ref of entity.chain_refs ?? []) {
      refs.add(ref.caip2);
    }
    if (entity.icon?.chain_ref) {
      refs.add(entity.icon.chain_ref);
    }
    for (const claim of entity.addresses ?? []) {
      refs.add(claim.submission_chain);
      for (const evidence of claim.evidence ?? []) {
        if (evidence.submission_chain) {
          refs.add(evidence.submission_chain);
        }
      }
    }
  }
  return [...refs].sort(compareCaip2);
}

export function compareCaip2(a, b) {
  const [, chainA] = a.split("-");
  const [, chainB] = b.split("-");
  return Number(chainA) - Number(chainB);
}

export function buildArtifacts(entities, chainlist) {
  const normalizedEntities = entities.map((entity) => normalizeEntity(entity));
  const generatedAt = chainlist.source.fetched_at;
  const chainlistSummary = {
    commit: chainlist.source.commit,
    repository: chainlist.source.repository,
  };

  const social = Object.fromEntries(
    normalizedEntities.map((entity) => [entity.id, resolveSocial(entity)]),
  );

  const entityDisplays = normalizedEntities.map((entity) => ({
    category: entity.category,
    chain_refs: entity.chain_refs ?? [],
    description: entity.description ?? null,
    icon: entity.icon ?? null,
    id: entity.id,
    name: entity.name,
    social: social[entity.id],
    status: entity.status,
    website: entity.website ?? null,
  }));

  const icons = Object.fromEntries(
    normalizedEntities.map((entity) => [
      entity.id,
      resolveIcon(entity.icon ?? null, chainlist),
    ]),
  );

  const byChain = {};
  for (const entity of normalizedEntities) {
    for (const claim of entity.addresses) {
      const submissionChain = claim.submission_chain;
      const address = claim.address;
      byChain[submissionChain] ??= {
        addresses: {},
        schema_version: 1,
        submission_chain: submissionChain,
      };
      byChain[submissionChain].addresses[address] ??= [];
      byChain[submissionChain].addresses[address].push({
        category: entity.category,
        chain_refs: entity.chain_refs ?? [],
        confidence: claim.confidence,
        entity_id: entity.id,
        icon: entity.icon ?? null,
        name: entity.name,
        role: claim.role,
        social: social[entity.id],
        status: claim.status,
        valid_from_block: claim.valid_from.block,
        valid_to_block: claim.valid_to?.block ?? null,
      });
    }
  }

  for (const chainArtifact of Object.values(byChain)) {
    for (const claims of Object.values(chainArtifact.addresses)) {
      claims.sort(compareClaims);
    }
  }

  const minByChain = {};
  for (const [chain, artifact] of Object.entries(byChain)) {
    minByChain[chain] = {};
    for (const [address, claims] of Object.entries(artifact.addresses)) {
      minByChain[chain][address] = claims.map((claim) => ({
        confidence: claim.confidence,
        entity_id: claim.entity_id,
        role: claim.role,
        status: claim.status,
        valid_from_block: claim.valid_from_block,
        valid_to_block: claim.valid_to_block,
      }));
    }
  }

  return {
    byChain,
    entities: {
      chainlist: chainlistSummary,
      entities: entityDisplays,
      generated_at: generatedAt,
      schema_version: 1,
    },
    icons: {
      chainlist: chainlistSummary,
      generated_at: generatedAt,
      icons,
      schema_version: 1,
    },
    registry: {
      chainlist: chainlistSummary,
      entities: normalizedEntities,
      generated_at: generatedAt,
      schema_version: 1,
    },
    social: {
      chainlist: chainlistSummary,
      generated_at: generatedAt,
      // Published alongside the accounts so consumers can resolve or
      // re-validate handles for platforms added after they shipped.
      platforms: socialPlatformDirectory(),
      schema_version: 1,
      social,
    },
    registryMin: {
      by_chain: minByChain,
      chainlist: chainlistSummary,
      entities: Object.fromEntries(
        entityDisplays.map((entity) => [
          entity.id,
          {
            category: entity.category,
            chain_refs: entity.chain_refs,
            icon: entity.icon,
            name: entity.name,
            social: entity.social,
            status: entity.status,
          },
        ]),
      ),
      generated_at: generatedAt,
      schema_version: 1,
    },
  };
}

export function artifactFileMap(artifacts) {
  const files = new Map([
    ["artifacts/entities.json", canonicalJson(artifacts.entities)],
    ["artifacts/icons.json", canonicalJson(artifacts.icons)],
    ["artifacts/registry.json", canonicalJson(artifacts.registry)],
    [
      "artifacts/registry.min.json",
      canonicalJson(artifacts.registryMin, { compact: true }),
    ],
    ["artifacts/social.json", canonicalJson(artifacts.social)],
  ]);

  for (const [chain, artifact] of Object.entries(artifacts.byChain).sort(
    ([a], [b]) => compareCaip2(a, b),
  )) {
    files.set(`artifacts/by-chain/${chain}.json`, canonicalJson(artifact));
  }

  return files;
}

export async function writeArtifacts(artifacts) {
  for (const [relativePath, content] of artifactFileMap(artifacts)) {
    const absolutePath = path.join(rootDir, relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, content);
  }
}

export async function assertArtifactsFresh(artifacts) {
  const expected = artifactFileMap(artifacts);
  const expectedPaths = new Set(expected.keys());
  const currentPaths = await listArtifactJsonFiles();
  const errors = [];

  for (const [relativePath, content] of expected) {
    const absolutePath = path.join(rootDir, relativePath);
    let actual;
    try {
      actual = await fs.readFile(absolutePath, "utf8");
    } catch {
      errors.push(`${relativePath} is missing`);
      continue;
    }
    if (actual !== content) {
      errors.push(`${relativePath} is stale`);
    }
  }

  for (const relativePath of currentPaths) {
    if (!expectedPaths.has(relativePath)) {
      errors.push(`${relativePath} is no longer generated`);
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Generated artifacts are not fresh:\n${errors.map((error) => `- ${error}`).join("\n")}`,
    );
  }
}

export async function listArtifactJsonFiles() {
  const files = [];
  async function walk(dir) {
    let entries = [];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const absolutePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath);
      } else if (entry.name.endsWith(".json")) {
        files.push(path.relative(rootDir, absolutePath));
      }
    }
  }
  await walk(artifactsDir);
  return files.sort();
}

export function normalizeEntity(entity) {
  const normalized = structuredClone(stripInternal(entity));
  normalized.addresses = normalized.addresses.map((claim) => ({
    ...claim,
    address: normalizeAddress(claim.address),
  }));
  if (normalized.social) {
    normalized.social = [...normalized.social].sort(compareSocialAccounts);
  }
  return normalized;
}

/**
 * Expands source `social` entries into the display form consumers use:
 * the platform's human-readable name, a canonical profile URL, and a
 * prefixed handle. URLs are always derived from the platform registry so a
 * handle is stored exactly once and can never drift from its link.
 */
export function resolveSocial(entity) {
  return [...(entity.social ?? [])]
    .sort(compareSocialAccounts)
    .map((account) => ({
      display: socialDisplay(account.platform, account.handle),
      handle: account.handle,
      platform: account.platform,
      platform_name: SOCIAL_PLATFORMS[account.platform].name,
      url: socialProfileUrl(account.platform, account.handle),
    }));
}

function compareSocialAccounts(a, b) {
  return (
    a.platform.localeCompare(b.platform) || a.handle.localeCompare(b.handle)
  );
}

export function resolveIcon(icon, chainlist) {
  if (!icon) {
    return null;
  }

  // Chainlist is authoritative whenever the referenced chain has an icon
  // upstream; the local file only fills the gap until one appears there.
  const chain = icon.chain_ref ? chainlist.chains[icon.chain_ref] : null;
  const iconName = chain?.icon ?? null;
  if (iconName) {
    return {
      chain_ref: icon.chain_ref,
      chainlist_icon: iconName,
      entries: chainlist.icons?.[iconName] ?? [],
      mode: "chainlist",
      source: "ethereum-lists/chains",
    };
  }

  if (icon.local) {
    return { mode: "local", ...icon.local };
  }

  return {
    chain_ref: icon.chain_ref,
    chainlist_icon: null,
    entries: [],
    mode: "chainlist",
    source: "ethereum-lists/chains",
  };
}

function compareClaims(a, b) {
  return (
    a.valid_from_block - b.valid_from_block ||
    CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence] ||
    a.entity_id.localeCompare(b.entity_id) ||
    a.role.localeCompare(b.role)
  );
}
