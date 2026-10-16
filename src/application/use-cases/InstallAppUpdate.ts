import type { AppUpdateProgress, AppUpdateService } from "../ports/AppUpdateService";
import { err, ok, type Result } from "../shared/Result";

export class InstallAppUpdate {
  private pending: Promise<Result<void, "install_failed">> | null = null;

  constructor(private readonly updater: AppUpdateService) {}

  execute(
    onProgress: (progress: AppUpdateProgress) => void,
  ): Promise<Result<void, "install_failed">> {
    this.pending ??= this.install(onProgress).finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  private async install(
    onProgress: (progress: AppUpdateProgress) => void,
  ): Promise<Result<void, "install_failed">> {
    try {
      await this.updater.install(onProgress);
      return ok(undefined);
    } catch {
      return err("install_failed");
    }
  }
}
