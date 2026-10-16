import { isTauri } from "@tauri-apps/api/core";
import { check, type Update } from "@tauri-apps/plugin-updater";
import type {
  AppUpdateInfo,
  AppUpdateProgress,
  AppUpdateService,
} from "../../application/ports/AppUpdateService";

type PreparedUpdate = Pick<Update, "version" | "body" | "downloadAndInstall" | "close">;
type UpdateChecker = (options: { timeout: number }) => Promise<PreparedUpdate | null>;

export class TauriAppUpdateService implements AppUpdateService {
  private update: PreparedUpdate | null = null;

  constructor(
    // Only Windows release installers are published by the release workflow.
    private readonly enabled = isTauri() &&
      import.meta.env.PROD &&
      /Windows/i.test(navigator.userAgent),
    private readonly checkUpdate: UpdateChecker = check,
  ) {}

  async check(): Promise<AppUpdateInfo | null> {
    if (!this.enabled) return null;
    this.update = await this.checkUpdate({ timeout: 5000 });
    return this.update ? { version: this.update.version, notes: this.update.body } : null;
  }

  async install(onProgress: (progress: AppUpdateProgress) => void): Promise<void> {
    if (!this.update) throw new Error("No app update has been selected.");

    let downloadedBytes = 0;
    let totalBytes: number | undefined;
    await this.update.downloadAndInstall((event) => {
      if (event.event === "Started") {
        downloadedBytes = 0;
        totalBytes = event.data.contentLength;
      } else if (event.event === "Progress") {
        downloadedBytes += event.data.chunkLength;
      }
      onProgress({
        downloadedBytes,
        totalBytes,
        phase: event.event === "Finished" ? "installing" : "downloading",
      });
    });
  }

  async dismiss(): Promise<void> {
    const update = this.update;
    this.update = null;
    await update?.close();
  }
}
