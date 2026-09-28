import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const binary = fileURLToPath(
  new URL("../src-tauri/target/debug/examples/window_state_smoke", import.meta.url),
);
const identifier = `com.smartinvoice.smoke.window${Date.now()}`;
let statePath;
for (const phase of [
  "resize",
  "normal",
  "maximize",
  "restore-maximized",
  "normal",
  "fullscreen",
  "restore-fullscreen",
  "normal",
  "minimize",
  "normal",
  "close",
  "normal",
  "fallback",
]) {
  if (phase === "fallback") writeFileSync(statePath, "invalid preferences");
  const result = spawnSync(binary, [], {
    encoding: "utf8",
    timeout: 15000,
    env: { ...process.env, SMART_INVOICE_SMOKE_ID: identifier, SMART_INVOICE_SMOKE_PHASE: phase },
  });
  const output = result.stdout ?? "";
  console.log(output.trim());
  // Close destroys the only window and ends the process before the worker reports.
  if (
    result.error ||
    result.status !== 0 ||
    (phase !== "close" && !output.includes(`WINDOW_STATE_PASS ${phase}`))
  ) {
    console.error(result.stderr, result.error ?? `exit=${result.status}`);
    process.exit(1);
  }
  statePath = output.match(/WINDOW_STATE_PATH (.+)/)?.[1];
  console.log(`Saved: ${readFileSync(statePath, "utf8").trim()}`);
}
console.log(
  `Native resize, maximize, fullscreen, minimize, close, quit, and invalid-file recovery PASS (${identifier}).`,
);
