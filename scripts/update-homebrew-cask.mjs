#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const args = process.argv.slice(2);

function readArg(name) {
  const index = args.indexOf(`--${name}`);
  if (index === -1 || index === args.length - 1) {
    return null;
  }
  return args[index + 1];
}

const tapDir = readArg("tap-dir");
const channel = readArg("channel");
const version = readArg("version");
const sha256 = readArg("sha256");

if (!tapDir || !channel || !version || !sha256) {
  console.error(
    "Usage: node scripts/update-homebrew-cask.mjs --tap-dir <dir> --channel <stable|beta> --version <version> --sha256 <sha256>",
  );
  process.exit(1);
}

if (channel !== "stable" && channel !== "beta") {
  console.error(`Unsupported channel '${channel}'`);
  process.exit(1);
}

const token = channel === "stable" ? "sly" : "sly@beta";
const conflictsToken = channel === "stable" ? "sly@beta" : "sly";
const caskPath = path.join(tapDir, "Casks", `${token}.rb`);

const cask = `cask "${token}" do
  version "${version}"
  sha256 "${sha256}"

  url "https://github.com/waynevernon/sly/releases/download/v#{version}/Sly_#{version}_universal.dmg"
  name "Sly"
  desc "Editor-first markdown notes app"
  homepage "https://github.com/waynevernon/sly"

  auto_updates true
  conflicts_with cask: "${conflictsToken}"
  depends_on macos: ">= :catalina"

  app "Sly.app"
end
`;

mkdirSync(path.dirname(caskPath), { recursive: true });
writeFileSync(caskPath, cask, "utf8");

console.log(`Updated ${caskPath}`);
