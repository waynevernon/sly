#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const CHANNEL_ENDPOINTS = {
  stable: "https://github.com/waynevernon/sly/releases/latest/download/latest.json",
  beta: "https://raw.githubusercontent.com/waynevernon/sly/updater-beta/latest.json",
};

const channel = process.argv[2];

if (!channel || !(channel in CHANNEL_ENDPOINTS)) {
  console.error("Usage: node scripts/set-updater-channel.mjs <stable|beta>");
  process.exit(1);
}

const repoRoot = process.cwd();
const tauriConfigPath = path.join(repoRoot, "src-tauri", "tauri.conf.json");
const rawConfig = readFileSync(tauriConfigPath, "utf8");
const config = JSON.parse(rawConfig);

if (
  !config.plugins ||
  !config.plugins.updater ||
  !Array.isArray(config.plugins.updater.endpoints)
) {
  console.error(`Missing updater endpoints in ${tauriConfigPath}`);
  process.exit(1);
}

const currentEndpoint = config.plugins.updater.endpoints[0];
const nextEndpoint = CHANNEL_ENDPOINTS[channel];

if (typeof currentEndpoint !== "string" || currentEndpoint.length === 0) {
  console.error(`Missing updater endpoint in ${tauriConfigPath}`);
  process.exit(1);
}

config.plugins.updater.endpoints = [nextEndpoint];

const nextConfig = rawConfig.replace(currentEndpoint, nextEndpoint);

if (nextConfig !== rawConfig) {
  writeFileSync(tauriConfigPath, nextConfig, "utf8");
}

console.log(
  `Configured updater channel '${channel}' -> ${nextEndpoint}`,
);
