#!/usr/bin/env node
// Ties the `obsidian` typings range in package.json to manifest.json's `minAppVersion`: the range
// must be exactly `^<minAppVersion>`.
//
// The caret keeps the installed typings ahead of the floor on purpose, so tsc knows the newer APIs
// that src/obsidian/compat.ts gates. What stops an ungated call is `obsidianmd/no-unsupported-api`,
// which reads the floor from the manifest. The range's lower bound is the one number that has no
// reader of its own, and this is it: raising or lowering the floor now fails here until both files
// say the same thing.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (file) => JSON.parse(readFileSync(join(root, file), "utf8"));

const { minAppVersion } = readJson("manifest.json");
const pkg = readJson("package.json");
const range = pkg.devDependencies?.obsidian ?? pkg.dependencies?.obsidian;
const expected = `^${minAppVersion}`;

if (range !== expected) {
  console.error(
    `obsidian typings: package.json declares "${range}", but manifest.json minAppVersion is ${minAppVersion}. ` +
      `Set the range to "${expected}" (and run pnpm install), or change minAppVersion deliberately.`,
  );
  process.exit(1);
}
console.log(`obsidian typings: "${range}" matches minAppVersion ${minAppVersion}.`);
