import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const roots = ["app.js", "sync-core.js", "server.mjs", "scripts", "tests"];
const extensions = new Set([".js", ".mjs"]);
const failures = [];

async function inspect(filePath) {
  const text = await readFile(filePath, "utf8");
  text.split(/\r?\n/).forEach((line, index) => {
    if (/\s+$/.test(line)) failures.push(`${filePath}:${index + 1}: trailing whitespace`);
    if (line.includes("\t")) failures.push(`${filePath}:${index + 1}: tab character`);
    if (line.includes("@ts-ignore")) failures.push(`${filePath}:${index + 1}: @ts-ignore is forbidden`);
  });
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

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("Source lint passed.");
