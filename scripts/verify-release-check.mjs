import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

function verifyFixture(newline, mismatch = false) {
  const root = mkdtempSync(join(tmpdir(), "invoice-release-check-"));
  try {
    mkdirSync(join(root, "scripts"));
    mkdirSync(join(root, "src-tauri"));
    const source = readFileSync(new URL("./verify-release.mjs", import.meta.url), "utf8");
    writeFileSync(join(root, "scripts/verify-release.mjs"), source);
    const write = (path, value) => writeFileSync(join(root, path), value.replace(/\n/g, newline));
    write("package.json", JSON.stringify({ version: "0.1.2" }));
    write(
      "package-lock.json",
      JSON.stringify({ version: "0.1.2", packages: { "": { version: "0.1.2" } } }),
    );
    write("src-tauri/Cargo.toml", '[package]\nname = "smart-invoice"\nversion = "0.1.2"\n');
    write(
      "src-tauri/Cargo.lock",
      `[[package]]\nname = "smart-invoice"\nversion = "${mismatch ? "0.1.1" : "0.1.2"}"\n`,
    );
    write(
      "src-tauri/tauri.conf.json",
      JSON.stringify({
        version: "0.1.2",
        identifier: "com.smartinvoice.desktop",
        bundle: { createUpdaterArtifacts: true },
        plugins: { updater: { pubkey: "fixture-public-key" } },
      }),
    );
    return spawnSync(process.execPath, [join(root, "scripts/verify-release.mjs")], {
      encoding: "utf8",
      env: { ...process.env, RELEASE_TAG: "v0.1.2" },
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("release verification accepts LF manifests and lockfiles", () => {
  const result = verifyFixture("\n");
  assert.equal(result.status, 0, result.stderr);
});

test("release verification accepts Windows CRLF manifests and lockfiles", () => {
  const result = verifyFixture("\r\n");
  assert.equal(result.status, 0, result.stderr);
});

test("release verification still rejects a mismatched Cargo lockfile on Windows", () => {
  const result = verifyFixture("\r\n", true);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Release versions must match/);
});
