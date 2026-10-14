import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = __dirname;
const port = Number(process.env.PORT || 3000);

const firebaseEnvKeys = {
  apiKey: "PUBLIC_FIREBASE_API_KEY",
  authDomain: "PUBLIC_FIREBASE_AUTH_DOMAIN",
  projectId: "PUBLIC_FIREBASE_PROJECT_ID",
  storageBucket: "PUBLIC_FIREBASE_STORAGE_BUCKET",
  messagingSenderId: "PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  appId: "PUBLIC_FIREBASE_APP_ID",
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
};

function buildFirebaseConfigScript() {
  const entries = Object.entries(firebaseEnvKeys);
  const hasAllValues = entries.every(([, envKey]) => Boolean(process.env[envKey]));

  if (!hasAllValues) {
    return "export const firebaseConfig = null;\n";
  }

  const firebaseConfig = Object.fromEntries(
    entries.map(([configKey, envKey]) => [configKey, process.env[envKey]])
  );

  return `export const firebaseConfig = ${JSON.stringify(firebaseConfig, null, 2)};\n`;
}

createServer(async (req, res) => {
  try {
    const requestPath = new URL(req.url || "/", `http://localhost:${port}`).pathname;

    if (req.method === "GET" && requestPath === "/firebase-client-settings.js") {
      res.writeHead(200, {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(buildFirebaseConfigScript());
      return;
    }

    const filePath = path.join(root, requestPath === "/" ? "index.html" : requestPath);
    const stats = await stat(filePath);

    if (!stats.isFile()) {
      throw new Error("Not a file");
    }

    const ext = path.extname(filePath).toLowerCase();
    const data = await readFile(filePath);

    res.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  } catch {
    try {
      const data = await readFile(path.join(root, "index.html"));
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(data);
    } catch {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Server error");
    }
  }
}).listen(port, () => {
  console.log(`http://localhost:${port}`);
});
