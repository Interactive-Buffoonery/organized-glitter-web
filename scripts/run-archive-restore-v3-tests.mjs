#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  chmodSync,
  closeSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { installPocketBase, POCKETBASE_VERSION } from "./install-pocketbase.mjs";
import "./test-archive-restore-v3-sha256.mjs";
import "./test-archive-restore-v3-migration.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
mkdirSync(path.join(root, ".tmp"), { recursive: true });
const runDir = mkdtempSync(path.join(root, ".tmp", "archive-restore-v3-"));
const dataDir = path.join(runDir, "server");
const hooksDir = path.join(dataDir, "pb_hooks");
const binary = path.join(dataDir, "pocketbase");
const adminEmail = "archive-v3-admin@localhost.test";
const adminPassword = "archive-v3-admin-password-123";
let server;
let stdout;
let stderr;
let succeeded = false;

const freePort = async () => {
  const socket = net.createServer();
  await new Promise(resolve => socket.listen(0, "127.0.0.1", resolve));
  const { port } = socket.address();
  await new Promise(resolve => socket.close(resolve));
  return port;
};

const waitForHealth = async (url, handle) => {
  for (let attempts = 0; attempts < 200; attempts += 1) {
    if (handle.exitCode !== null) throw new Error(`PocketBase exited with ${handle.exitCode}.`);
    try {
      if ((await fetch(`${url}/api/health`)).ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error("PocketBase did not become ready.");
};

const stop = handle =>
  new Promise(resolve => {
    if (!handle || handle.exitCode !== null) return resolve();
    const timeout = setTimeout(() => handle.kill("SIGKILL"), 5_000);
    handle.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
    handle.kill("SIGTERM");
  });

try {
  mkdirSync(hooksDir, { recursive: true });
  const cached = await installPocketBase({
    destination: path.join(root, ".tmp", "pocketbase-cache", POCKETBASE_VERSION, "pocketbase"),
  });
  copyFileSync(cached, binary);
  chmodSync(binary, 0o755);
  copyFileSync(
    path.join(root, "pb_hooks", "archive_restore_v3.pb.js"),
    path.join(hooksDir, "archive_restore_v3.pb.js"),
  );
  // Exercise the production main-photo route without the other coloring hooks,
  // which create blank pages and alter the archive fixture's page inventory.
  const coloringHook = readFileSync(path.join(root, "pb_hooks", "coloring.pb.js"), "utf8");
  const mainPhotoStart = coloringHook.indexOf("routerAdd(\n  'POST',\n  '/api/coloring/pages/{pageId}/main-photo'");
  const mainPhotoEnd = coloringHook.indexOf("\nonRecordCreate(e =>", mainPhotoStart);
  assert.ok(mainPhotoStart >= 0 && mainPhotoEnd > mainPhotoStart);
  writeFileSync(path.join(hooksDir, "coloring-main-photo.pb.js"),
    coloringHook.slice(mainPhotoStart, mainPhotoEnd));
  copyFileSync(
    path.join(root, "scripts", "fixtures", "archive-restore-v3-rollback.pb.js"),
    path.join(hooksDir, "archive-restore-v3-rollback.pb.js"),
  );

  const setup = spawn(binary, [
    "superuser",
    "upsert",
    adminEmail,
    adminPassword,
    `--dir=${path.join(dataDir, "pb_data")}`,
  ]);
  assert.equal(await new Promise(resolve => setup.once("exit", resolve)), 0);

  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  stdout = openSync(path.join(runDir, "stdout.log"), "a");
  stderr = openSync(path.join(runDir, "stderr.log"), "a");
  server = spawn(
    binary,
    [
      "serve",
      `--http=127.0.0.1:${port}`,
      `--dir=${path.join(dataDir, "pb_data")}`,
      `--hooksDir=${hooksDir}`,
      "--automigrate=false",
      "--dev",
    ],
    { stdio: ["ignore", stdout, stderr] },
  );
  await waitForHealth(baseUrl, server);

  const auth = await fetch(`${baseUrl}/api/collections/_superusers/auth-with-password`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identity: adminEmail, password: adminPassword }),
  }).then(response => response.json());
  assert.ok(auth.token, "superuser authentication failed");
  const schema = JSON.parse(
    readFileSync(path.join(root, "docs", "pocketbase", "collections.schema.json"), "utf8"),
  );
  const imported = await fetch(`${baseUrl}/api/collections/import`, {
    method: "PUT",
    headers: { authorization: auth.token, "content-type": "application/json" },
    body: JSON.stringify({ collections: schema, deleteMissing: true }),
  });
  assert.equal(imported.status, 204, await imported.text());

  const imagePath = path.join(runDir, "pixel.png");
  writeFileSync(
    imagePath,
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    ),
  );
  const child = spawn(process.execPath, [path.join(root, "scripts/test-archive-restore-v3-endpoints.mjs")], {
    cwd: root,
    env: {
      ...process.env,
      PB_URL: baseUrl,
      PB_SQL_LOG_PATH: path.join(runDir, "stdout.log"),
      PB_ADMIN_TOKEN: auth.token,
      TEST_IMAGE_PATH: imagePath,
    },
    stdio: "inherit",
  });
  assert.equal(await new Promise(resolve => child.once("exit", resolve)), 0);
  succeeded = true;
  console.log("archive restore v3 disposable PocketBase checks passed");
} finally {
  await stop(server);
  if (stdout !== undefined) closeSync(stdout);
  if (stderr !== undefined) closeSync(stderr);
  if (succeeded) {
    rmSync(runDir, { recursive: true, force: true });
  } else {
    console.error(`Archive restore v3 diagnostics retained at ${runDir}`);
  }
}
