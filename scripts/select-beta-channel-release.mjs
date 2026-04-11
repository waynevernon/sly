#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import process from "node:process";
import { selectEffectiveBetaChannelRelease } from "./select-beta-channel-release-lib.mjs";

const args = process.argv.slice(2);

function readArg(name) {
  const index = args.indexOf(`--${name}`);
  if (index === -1 || index === args.length - 1) {
    return null;
  }
  return args[index + 1];
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
const selectedRelease = selectEffectiveBetaChannelRelease(releases);

if (!selectedRelease) {
  console.error("No published stable or prerelease releases were found");
  process.exit(1);
}

const effectiveChannel =
  selectedRelease.isPrerelease === true ? "beta" : "stable";

console.log(`tag=${selectedRelease.tagName}`);
console.log(`version=${selectedRelease.tagName.replace(/^v/, "")}`);
console.log(`source_channel=${effectiveChannel}`);
