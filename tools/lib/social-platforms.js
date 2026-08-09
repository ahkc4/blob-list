/**
 * Registry of social platforms an entity may be linked to.
 *
 * This is the single source of truth. Adding a platform is one entry here:
 * source YAML accepts the new `platform` id immediately, validation enforces
 * the handle shape, and the generator derives profile URLs. No schema change
 * and no other code change are required.
 *
 * Fields:
 * - `name`           Human-readable platform name for display.
 * - `handle_pattern` Anchored ECMAScript regex source the handle must match.
 * - `url_template`   Profile URL with a single `{handle}` placeholder.
 * - `handle_prefix`  Display prefix for the handle (defaults to `@`).
 *
 * `handle_pattern` and `url_template` are stored as strings so they can be
 * published verbatim in `artifacts/social.json`, letting consumers resolve or
 * re-validate handles for platforms they have never heard of.
 */
export const SOCIAL_PLATFORMS = {
  farcaster: {
    // fnames are 1-16 chars of [a-z0-9-] without a leading or trailing
    // hyphen; ENS names are also valid Farcaster usernames.
    handle_pattern:
      "^(?:[a-z0-9](?:[a-z0-9-]{0,14}[a-z0-9])?|[a-z0-9-]{1,63}\\.eth)$",
    name: "Farcaster",
    url_template: "https://farcaster.xyz/{handle}",
  },
  x: {
    handle_pattern: "^[A-Za-z0-9_]{1,15}$",
    name: "X",
    url_template: "https://x.com/{handle}",
  },
};

export const SOCIAL_PLATFORM_IDS = Object.keys(SOCIAL_PLATFORMS).sort();

export function socialPlatform(platformId) {
  return SOCIAL_PLATFORMS[platformId] ?? null;
}

export function isValidSocialHandle(platformId, handle) {
  const platform = SOCIAL_PLATFORMS[platformId];
  if (!platform) {
    return false;
  }
  return new RegExp(platform.handle_pattern, "u").test(handle);
}

export function socialProfileUrl(platformId, handle) {
  const platform = requirePlatform(platformId);
  return platform.url_template.replace(
    "{handle}",
    encodeURIComponent(handle).replaceAll("%40", "@"),
  );
}

export function socialDisplay(platformId, handle) {
  const platform = requirePlatform(platformId);
  return `${platform.handle_prefix ?? "@"}${handle}`;
}

export function socialPlatformDirectory() {
  return Object.fromEntries(
    Object.entries(SOCIAL_PLATFORMS).map(([platformId, platform]) => [
      platformId,
      {
        handle_pattern: platform.handle_pattern,
        handle_prefix: platform.handle_prefix ?? "@",
        name: platform.name,
        url_template: platform.url_template,
      },
    ]),
  );
}

function requirePlatform(platformId) {
  const platform = SOCIAL_PLATFORMS[platformId];
  if (!platform) {
    throw new Error(
      `Unknown social platform: ${platformId} (known: ${SOCIAL_PLATFORM_IDS.join(", ")})`,
    );
  }
  return platform;
}
