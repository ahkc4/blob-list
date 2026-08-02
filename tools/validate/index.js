#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import {
  STRONG_EVIDENCE_TYPES,
  assertArtifactsFresh,
  buildArtifacts,
  loadChainlistSnapshot,
  loadEntities,
  loadSchemas,
  makeAjv,
  normalizeAddress,
  rootDir,
  stripInternal,
} from "../lib/registry.js";

const URL_EVIDENCE_TYPES = new Set([
  "documentation",
  "announcement",
  "verified_contract",
  "analysis",
  "repository",
  "dashboard",
]);

try {
  const errors = [];
  const [entities, chainlist, schemas] = await Promise.all([
    loadEntities(),
    loadChainlistSnapshot(),
    loadSchemas(),
  ]);

  const ajv = makeAjv();
  ajv.addSchema(schemas.entity, "entity.schema.json");
  const validateEntity = ajv.compile(schemas.entity);
  const validateRegistryArtifact = ajv.compile(schemas.registryArtifact);
  const validateChainArtifact = ajv.compile(schemas.chainArtifact);

  const ids = new Map();
  for (const entity of entities) {
    if (!validateEntity(stripInternal(entity))) {
      for (const error of validateEntity.errors ?? []) {
        errors.push(
          `${relative(entity.__file)}${error.instancePath}: ${error.message}`,
        );
      }
    }

    const expectedFile = `${entity.id}.yaml`;
    const actualFile = path.basename(entity.__file);
    if (actualFile !== expectedFile) {
      errors.push(`${relative(entity.__file)} must be named ${expectedFile}`);
    }

    if (ids.has(entity.id)) {
      errors.push(
        `Duplicate entity id ${entity.id} in ${relative(entity.__file)} and ${relative(
          ids.get(entity.id),
        )}`,
      );
    }
    ids.set(entity.id, entity.__file);

    await validateEntitySemantics(entity, chainlist, errors);
  }

  validateOverlaps(entities, errors);

  const artifacts = buildArtifacts(entities, chainlist);
  if (!validateRegistryArtifact(artifacts.registry)) {
    for (const error of validateRegistryArtifact.errors ?? []) {
      errors.push(
        `artifacts/registry.json${error.instancePath}: ${error.message}`,
      );
    }
  }
  for (const [chain, artifact] of Object.entries(artifacts.byChain)) {
    if (!validateChainArtifact(artifact)) {
      for (const error of validateChainArtifact.errors ?? []) {
        errors.push(
          `artifacts/by-chain/${chain}.json${error.instancePath}: ${error.message}`,
        );
      }
    }
  }

  try {
    await assertArtifactsFresh(artifacts);
  } catch (error) {
    errors.push(error.message);
  }

  if (errors.length > 0) {
    throw new Error(errors.map((error) => `- ${error}`).join("\n"));
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

async function validateEntitySemantics(entity, chainlist, errors) {
  for (const ref of entity.chain_refs ?? []) {
    assertKnownChain(ref.caip2, chainlist, errors, entity.__file);
  }

  if (entity.icon?.chain_ref) {
    assertKnownChain(entity.icon.chain_ref, chainlist, errors, entity.__file);
  }
  if (entity.icon?.local) {
    await validateLocalIcon(entity, errors);
  }

  for (const claim of entity.addresses ?? []) {
    assertKnownChain(claim.submission_chain, chainlist, errors, entity.__file);
    try {
      if (normalizeAddress(claim.address) !== claim.address) {
        errors.push(
          `${relative(entity.__file)}: ${claim.address} is not checksummed`,
        );
      }
    } catch {
      errors.push(
        `${relative(entity.__file)}: ${claim.address} is not an EVM address`,
      );
    }

    if (claim.valid_to && claim.valid_to.block < claim.valid_from.block) {
      errors.push(
        `${relative(entity.__file)}: ${claim.label} valid_to.block is before valid_from.block`,
      );
    }

    if (
      claim.confidence === "confirmed" &&
      !claim.evidence.some((item) => STRONG_EVIDENCE_TYPES.has(item.type))
    ) {
      errors.push(
        `${relative(entity.__file)}: ${claim.label} is confirmed without strong evidence`,
      );
    }

    for (const evidence of claim.evidence ?? []) {
      if (URL_EVIDENCE_TYPES.has(evidence.type) && !evidence.url) {
        errors.push(
          `${relative(entity.__file)}: ${claim.label} ${evidence.type} evidence needs a URL`,
        );
      }
      if (evidence.type === "transaction") {
        if (!evidence.submission_chain || !evidence.tx_hash) {
          errors.push(
            `${relative(entity.__file)}: ${claim.label} transaction evidence needs submission_chain and tx_hash`,
          );
        }
        if (evidence.submission_chain) {
          assertKnownChain(
            evidence.submission_chain,
            chainlist,
            errors,
            entity.__file,
          );
        }
      }
    }
  }
}

async function validateLocalIcon(entity, errors) {
  const iconSource = entity.icon.local.source;
  const iconPath = path.join(rootDir, iconSource);
  try {
    const stat = await fs.stat(iconPath);
    if (stat.size > 100 * 1024) {
      errors.push(`${iconSource} exceeds the 100 KiB local icon limit`);
    }
    const source = await fs.readFile(iconPath, "utf8");
    if (!source.trimStart().startsWith("<svg")) {
      errors.push(`${iconSource} must be an SVG file`);
    }
    // xmlns namespace declarations legitimately contain http:// URLs, so
    // scrub them before scanning for remote references.
    const scrubbed = source.replace(
      /\bxmlns(?::[A-Za-z0-9]+)?\s*=\s*("[^"]*"|'[^']*')/giu,
      "xmlns=''",
    );
    if (
      /<script\b|<image\b|<foreignObject\b|https?:\/\/|data:/iu.test(scrubbed)
    ) {
      errors.push(
        `${iconSource} must not contain scripts, raster embeds, foreign objects, data URLs, or remote refs`,
      );
    }
  } catch {
    errors.push(
      `${relative(entity.__file)}: local icon ${iconSource} is missing`,
    );
  }
}

function validateOverlaps(entities, errors) {
  const claimsByKey = new Map();
  for (const entity of entities) {
    for (const claim of entity.addresses ?? []) {
      if (claim.status !== "active" || claim.confidence === "disputed") {
        continue;
      }
      const key = [
        claim.submission_chain,
        claim.address.toLowerCase(),
        claim.role,
      ].join(":");
      claimsByKey.set(key, [
        ...(claimsByKey.get(key) ?? []),
        {
          claim,
          entity,
          from: claim.valid_from.block,
          to: claim.valid_to?.block ?? Number.POSITIVE_INFINITY,
        },
      ]);
    }
  }

  for (const claims of claimsByKey.values()) {
    claims.sort((a, b) => a.from - b.from);
    for (let i = 0; i < claims.length; i += 1) {
      for (let j = i + 1; j < claims.length; j += 1) {
        if (claims[j].from > claims[i].to) {
          break;
        }
        const first = claims[i];
        const second = claims[j];
        errors.push(
          `Overlapping active claim for ${first.claim.submission_chain} ${first.claim.address} ${first.claim.role}: ${first.entity.id} and ${second.entity.id}`,
        );
      }
    }
  }
}

function assertKnownChain(caip2, chainlist, errors, file) {
  if (!chainlist.chains[caip2]) {
    errors.push(
      `${relative(file)}: ${caip2} is missing from data/chainlist/snapshot.json`,
    );
  }
}

function relative(file) {
  return path.relative(rootDir, file);
}
