import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { installPocketBase, POCKETBASE_VERSION } from "./install-pocketbase.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
mkdirSync(path.join(root, ".tmp"), { recursive: true });
const runDir = mkdtempSync(path.join(root, ".tmp", "archive-restore-migration-"));
const dataDir = path.join(runDir, "pb_data");
const migrationsDir = path.join(runDir, "migrations");
try {
  mkdirSync(migrationsDir);
  copyFileSync(
    path.join(root, "pb_migrations", "1790096384_created_archive_restore_items.js"),
    path.join(migrationsDir, "1790096384_created_archive_restore_items.js"),
  );
  const binary = await installPocketBase({
    destination: path.join(root, ".tmp", "pocketbase-cache", POCKETBASE_VERSION, "pocketbase"),
  });
  const migrate = (direction) => spawnSync(binary, ["migrate", direction, ...(direction === "down" ? ["1"] : []),
    `--dir=${dataDir}`, `--migrationsDir=${migrationsDir}`, "--automigrate=false"],
    { encoding: "utf8", input: "y\n" });

  let result = migrate("up");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  result = migrate("down");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  result = migrate("up");
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const db = new DatabaseSync(path.join(dataDir, "data.db"));
  try {
    db.prepare(`INSERT INTO archive_restore_items
      (id, user, backup_id, item_id, item_kind, item_digest, descriptor_digest,
       state, target_collection, target_record_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      "receiptfixture1", "fixtureuser0001", "00000000-0000-0000-0000-000000000000",
      "diamond-project:test", "diamond-project", "a".repeat(64), "a".repeat(64),
      "complete", "projects", "targetfixture1",
    );
  } finally {
    db.close();
  }
  result = migrate("down");
  assert.notEqual(result.status, 0, `populated receipt migration must refuse rollback: ${result.stdout} ${result.stderr}`);
  const retained = new DatabaseSync(path.join(dataDir, "data.db"));
  try {
    assert.equal(retained.prepare("SELECT COUNT(*) AS total FROM archive_restore_items").get().total, 1);
  } finally {
    retained.close();
  }
  console.log("archive restore v3 empty and populated migration rollback checks passed");
} finally {
  rmSync(runDir, { recursive: true, force: true });
}
