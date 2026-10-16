import { readFileSync } from "node:fs";
import process from "node:process";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const packageJson = JSON.parse(read("package.json"));
const packageLock = JSON.parse(read("package-lock.json"));
const config = JSON.parse(read("src-tauri/tauri.conf.json"));
const cargoVersion = read("src-tauri/Cargo.toml").match(
  /\[package\][\s\S]*?^version = "([^"]+)"/m,
)?.[1];
const cargoLockVersion = read("src-tauri/Cargo.lock").match(
  /name = "smart-invoice"\nversion = "([^"]+)"/,
)?.[1];
const versions = [
  packageJson.version,
  packageLock.version,
  packageLock.packages[""].version,
  cargoVersion,
  cargoLockVersion,
];

if (versions.some((version) => version !== config.version)) {
  throw new Error(`Release versions must match ${config.version}: ${versions.join(", ")}`);
}
if (process.env.RELEASE_TAG && process.env.RELEASE_TAG !== `v${config.version}`) {
  throw new Error(`Expected tag v${config.version}, received ${process.env.RELEASE_TAG}`);
}
if (config.identifier !== "com.smartinvoice.desktop") {
  throw new Error(
    "Keep the existing application identifier so upgrades use the existing data directory.",
  );
}
if (!config.plugins?.updater?.pubkey || !config.bundle.createUpdaterArtifacts) {
  throw new Error("Updater public key and signed updater artifacts must be configured.");
}
console.log(`Release configuration verified: v${config.version}`);
