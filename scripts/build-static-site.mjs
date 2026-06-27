import { cp, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, "dist");

const firebaseEnvKeys = {
  apiKey: "PUBLIC_FIREBASE_API_KEY",
  authDomain: "PUBLIC_FIREBASE_AUTH_DOMAIN",
  projectId: "PUBLIC_FIREBASE_PROJECT_ID",
  storageBucket: "PUBLIC_FIREBASE_STORAGE_BUCKET",
  messagingSenderId: "PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  appId: "PUBLIC_FIREBASE_APP_ID",
};

const staticExtensions = new Set([
  ".css",
  ".gif",
  ".html",
  ".ico",
  ".jpeg",
  ".jpg",
  ".js",
  ".json",
  ".map",
  ".png",
  ".svg",
  ".txt",
  ".webp",
]);

const ignoredDirectories = new Set([
  ".git",
  ".github",
  "dist",
  "node_modules",
  "scripts",
]);

const ignoredRootFiles = new Set([
  "package.json",
  "package-lock.json",
  "README.md",
  "server.mjs",
]);

function buildFirebaseConfigScript() {
  const entries = Object.entries(firebaseEnvKeys);
  const missingKeys = entries
    .filter(([, envKey]) => !process.env[envKey])
    .map(([, envKey]) => envKey);

  if (missingKeys.length > 0) {
    console.warn(
      `Firebase config was not generated because these env vars are missing: ${missingKeys.join(", ")}`
    );
    return "export const firebaseConfig = null;\n";
  }

  const firebaseConfig = Object.fromEntries(
    entries.map(([configKey, envKey]) => [configKey, process.env[envKey]])
  );

  return `export const firebaseConfig = ${JSON.stringify(firebaseConfig, null, 2)};\n`;
}

async function copyStaticFiles(sourceDir, targetDir, isRoot = false) {
  await mkdir(targetDir, { recursive: true });
  const entries = await readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      if (ignoredDirectories.has(entry.name)) {
        continue;
      }
      await copyStaticFiles(sourcePath, targetPath);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (isRoot && ignoredRootFiles.has(entry.name)) {
      continue;
    }

    if (!staticExtensions.has(path.extname(entry.name).toLowerCase())) {
      continue;
    }

    await cp(sourcePath, targetPath);
  }
}

await rm(dist, { recursive: true, force: true });
await copyStaticFiles(root, dist, true);
await writeFile(path.join(dist, "firebase-config.js"), buildFirebaseConfigScript(), "utf8");

const indexPath = path.join(dist, "index.html");
await stat(indexPath);
console.log(`Static site built to ${path.relative(root, dist)}`);
