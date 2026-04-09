#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import process from "node:process";

const args = process.argv.slice(2);

function readArg(name) {
  const index = args.indexOf(`--${name}`);
  if (index === -1 || index === args.length - 1) {
    return null;
  }
  return args[index + 1];
}

function parseVersion(tagName) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(tagName);
  if (!match) {
    throw new Error(`Unsupported release tag '${tagName}'`);
  }

  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
    prerelease: match[4] ? match[4].split(".") : [],
  };
}

function compareIdentifiers(left, right) {
  const leftNumeric = /^\d+$/.test(left);
  const rightNumeric = /^\d+$/.test(right);

  if (leftNumeric && rightNumeric) {
    return Number.parseInt(left, 10) - Number.parseInt(right, 10);
  }

  if (leftNumeric) {
    return -1;
  }

  if (rightNumeric) {
    return 1;
  }

  return left.localeCompare(right);
}

function compareVersions(leftTag, rightTag) {
  const left = parseVersion(leftTag);
  const right = parseVersion(rightTag);

  if (left.major !== right.major) {
    return left.major - right.major;
  }
  if (left.minor !== right.minor) {
    return left.minor - right.minor;
  }
  if (left.patch !== right.patch) {
    return left.patch - right.patch;
  }

  const leftHasPrerelease = left.prerelease.length > 0;
  const rightHasPrerelease = right.prerelease.length > 0;

  if (!leftHasPrerelease && !rightHasPrerelease) {
    return 0;
  }
  if (!leftHasPrerelease) {
    return 1;
  }
  if (!rightHasPrerelease) {
    return -1;
  }

  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = left.prerelease[index];
    const rightPart = right.prerelease[index];

    if (leftPart === undefined) {
      return -1;
    }
    if (rightPart === undefined) {
      return 1;
    }

    const difference = compareIdentifiers(leftPart, rightPart);
    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
}

function selectHighestRelease(releases) {
  if (releases.length === 0) {
    return null;
  }

  return releases.reduce((current, candidate) => {
    if (compareVersions(candidate.tagName, current.tagName) > 0) {
      return candidate;
    }
    return current;
  });
}

const repo = readArg("repo");

if (!repo) {
  console.error(
    "Usage: node scripts/select-beta-channel-release.mjs --repo <owner/name>",
  );
  process.exit(1);
}

const releaseList = execFileSync(
  "gh",
  [
    "release",
    "list",
    "--repo",
    repo,
    "--exclude-drafts",
    "--limit",
    "50",
    "--json",
    "tagName,isPrerelease,name,publishedAt",
  ],
  {
    encoding: "utf8",
  },
);

const releases = JSON.parse(releaseList);
const stableRelease = selectHighestRelease(
  releases.filter((release) => release.isPrerelease !== true),
);
const prerelease = selectHighestRelease(
  releases.filter((release) => release.isPrerelease === true),
);

const selectedRelease =
  stableRelease === null
    ? prerelease
    : prerelease === null
      ? stableRelease
      : compareVersions(prerelease.tagName, stableRelease.tagName) > 0
        ? prerelease
        : stableRelease;

if (!selectedRelease) {
  console.error("No published stable or prerelease releases were found");
  process.exit(1);
}

const effectiveChannel =
  selectedRelease.isPrerelease === true ? "beta" : "stable";

console.log(`tag=${selectedRelease.tagName}`);
console.log(`version=${selectedRelease.tagName.replace(/^v/, "")}`);
console.log(`source_channel=${effectiveChannel}`);
