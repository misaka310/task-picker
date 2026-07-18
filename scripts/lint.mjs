import { spawnSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const roots = ["app.js", "sync-core.js", "server.mjs", "scripts", "tests"];
const extensions = new Set([".js", ".mjs"]);
const failures = [];
const files = [];

async function inspect(filePath) {
  files.push(filePath);
  if (filePath === path.join("scripts", "lint.mjs")) return;
  const text = await readFile(filePath, "utf8");
  if (text.includes("@ts-ignore")) failures.push(`${filePath}: @ts-ignore is forbidden`);
  if (/\beval\s*\(/.test(text)) failures.push(`${filePath}: eval() is forbidden`);
}

async function visit(target) {
  const entries = await readdir(target, { withFileTypes: true });
  for (const entry of entries) {
    const filePath = path.join(target, entry.name);
    if (entry.isDirectory()) await visit(filePath);
    else if (entry.isFile() && extensions.has(path.extname(entry.name))) await inspect(filePath);
  }
}

for (const root of roots) {
  if (path.extname(root)) await inspect(root);
  else await visit(root);
}

for (const filePath of files) {
  const result = spawnSync(process.execPath, ["--check", filePath], {
    encoding: "utf8",
    shell: false,
  });
  if (result.status !== 0) {
    failures.push(`${filePath}: ${result.stderr || result.stdout || "syntax check failed"}`.trim());
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`Source lint passed for ${files.length} JavaScript files.`);
