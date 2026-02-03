#!/usr/bin/env node
/**
 * Creates dddextension.zip for Chrome Web Store submission.
 * Packs the extension folder with manifest.json at root.
 */
const fs = require("fs");
const path = require("path");
const archiver = require("archiver");

const EXTENSION_DIR = path.join(__dirname, "..", "extension");
const OUTPUT = path.join(__dirname, "..", "dddextension.zip");

// Files to exclude from the store package (developer docs, privacy policy for hosting elsewhere)
const EXCLUDE = ["PUBLISH.md", "STORE_LISTING.md", "PRIVACY_POLICY.md", "privacy-policy.html"];

function walkDir(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const relPath = path.relative(EXTENSION_DIR, fullPath);
    if (fs.statSync(fullPath).isDirectory()) {
      walkDir(fullPath, fileList);
    } else if (!EXCLUDE.includes(file)) {
      fileList.push(relPath);
    }
  }
  return fileList;
}

const files = walkDir(EXTENSION_DIR);
const output = fs.createWriteStream(OUTPUT);
const archive = archiver("zip", { zlib: { level: 9 } });

output.on("close", () => {
  console.log("Created:", OUTPUT);
  console.log("Size:", (archive.pointer() / 1024).toFixed(1), "KB");
  console.log("Files:", files.length);
});

archive.on("error", (err) => {
  throw err;
});

archive.pipe(output);

for (const file of files) {
  archive.file(path.join(EXTENSION_DIR, file), { name: file });
}

archive.finalize();
