import type { AppUpdateInfo, AppUpdateService } from "../ports/AppUpdateService";
import { err, ok, type Result } from "../shared/Result";

export class CheckForAppUpdate {
  private result: Promise<Result<AppUpdateInfo | null, "check_failed">> | null = null;

  constructor(private readonly updater: AppUpdateService) {}

  // One startup check per application session, including React StrictMode remounts.
  execute(): Promise<Result<AppUpdateInfo | null, "check_failed">> {
    this.result ??= this.check();
    return this.result;
  }

  async dismiss(): Promise<Result<void, "dismiss_failed">> {
    try {
      // Release a late response too if the user opens the app before checking finishes.
      await this.result;
      await this.updater.dismiss();
      return ok(undefined);
    } catch {
      return err("dismiss_failed");
    }
  }

  private async check(): Promise<Result<AppUpdateInfo | null, "check_failed">> {
    try {
      return ok(await this.updater.check());
    } catch {
      return err("check_failed");
    }
  }
}
