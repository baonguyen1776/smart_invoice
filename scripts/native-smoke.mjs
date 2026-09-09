import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const binary = fileURLToPath(
  new URL("../src-tauri/target/release/examples/native_smoke", import.meta.url),
);
const identifier = `com.smartinvoice.smoke.run${Date.now()}`;
const times = [];
let dataDirectory;
for (let index = 0; index < 21; index++) {
  const phase = index === 0 ? "write" : "reopen";
  const result = spawnSync(binary, [], {
    encoding: "utf8",
    timeout: 30000,
    env: { ...process.env, SMART_INVOICE_SMOKE_ID: identifier, SMART_INVOICE_SMOKE_PHASE: phase },
  });
  const output = result.stdout ?? "";
  if (result.error || result.status !== 0 || !output.includes("SMOKE_RESULT")) {
    console.error(output, result.stderr, result.error ?? `exit=${result.status}`);
    process.exit(1);
  }
  const init = Number(output.match(/SMOKE_INIT_MS ([\d.]+)/)?.[1]);
  if (!Number.isFinite(init)) throw new Error("Missing initialization measurement");
  dataDirectory = output.match(/SMOKE_DATA_DIR (.+)/)?.[1];
  const report = JSON.parse(output.match(/SMOKE_RESULT (.+)/)[1]);
  if (report.error || report.phase !== phase) throw new Error(JSON.stringify(report));
  if (index > 0) times.push(init);
  console.log(
    `NATIVE_SMOKE run=${index} phase=${phase} init_ms=${init} checks=${report.checks.length} PASS`,
  );
}
times.sort((a, b) => a - b);
console.log(
  JSON.stringify(
    {
      identifier,
      dataDirectory,
      freshProcessReopen: {
        samples: times.length,
        medianMs: times[Math.floor(times.length / 2)],
        p95Ms: times[Math.ceil(times.length * 0.95) - 1],
        maxMs: times.at(-1),
      },
      note: "Dedicated smoke profile retained for inspection; production profile untouched.",
    },
    null,
    2,
  ),
);
