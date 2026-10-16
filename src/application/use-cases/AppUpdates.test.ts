import { describe, expect, it, vi } from "vitest";
import type { AppUpdateInfo, AppUpdateService } from "../ports/AppUpdateService";
import { CheckForAppUpdate } from "./CheckForAppUpdate";
import { InstallAppUpdate } from "./InstallAppUpdate";

function service(): AppUpdateService {
  return {
    check: vi.fn(async () => ({ version: "0.1.2" })),
    dismiss: vi.fn(async () => {}),
    install: vi.fn(async () => {}),
  };
}

describe("application updates", () => {
  it("checks once per session and shares the result across startup remounts", async () => {
    const updater = service();
    const check = new CheckForAppUpdate(updater);
    const first = check.execute();
    expect(check.execute()).toBe(first);
    expect(await first).toEqual({ ok: true, value: { version: "0.1.2" } });
    await check.execute();
    expect(updater.check).toHaveBeenCalledTimes(1);
  });

  it("returns no update when the installed version is current", async () => {
    const updater = service();
    vi.mocked(updater.check).mockResolvedValue(null);
    expect(await new CheckForAppUpdate(updater).execute()).toEqual({ ok: true, value: null });
  });

  it("maps offline and missing-release failures without exposing transport errors", async () => {
    const updater = service();
    vi.mocked(updater.check).mockRejectedValue(new Error("network details"));
    expect(await new CheckForAppUpdate(updater).execute()).toEqual({
      ok: false,
      error: "check_failed",
    });
  });

  it("waits for a late check before dismissing its native resource", async () => {
    const updater = service();
    let resolve!: (value: AppUpdateInfo) => void;
    vi.mocked(updater.check).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const check = new CheckForAppUpdate(updater);
    void check.execute();
    const dismissed = check.dismiss();
    expect(updater.dismiss).not.toHaveBeenCalled();
    resolve({ version: "0.1.2" });
    expect(await dismissed).toEqual({ ok: true, value: undefined });
    expect(updater.dismiss).toHaveBeenCalledTimes(1);
    expect(updater.install).not.toHaveBeenCalled();
  });

  it("maps cleanup failures", async () => {
    const updater = service();
    vi.mocked(updater.dismiss).mockRejectedValue(new Error("closed resource"));
    expect(await new CheckForAppUpdate(updater).dismiss()).toEqual({
      ok: false,
      error: "dismiss_failed",
    });
  });

  it("coalesces simultaneous installation requests and forwards progress", async () => {
    const updater = service();
    let finish!: () => void;
    vi.mocked(updater.install).mockImplementation((progress) => {
      progress({ phase: "downloading", downloadedBytes: 5, totalBytes: 10 });
      return new Promise((done) => {
        finish = done;
      });
    });
    const installer = new InstallAppUpdate(updater);
    const progress = vi.fn();
    const first = installer.execute(progress);
    expect(installer.execute(vi.fn())).toBe(first);
    expect(updater.install).toHaveBeenCalledTimes(1);
    expect(progress).toHaveBeenCalledWith({
      phase: "downloading",
      downloadedBytes: 5,
      totalBytes: 10,
    });
    finish();
    expect(await first).toEqual({ ok: true, value: undefined });
  });

  it("allows retry after installation or signature verification fails", async () => {
    const updater = service();
    vi.mocked(updater.install).mockRejectedValueOnce(new Error("invalid signature"));
    const installer = new InstallAppUpdate(updater);
    expect(await installer.execute(vi.fn())).toEqual({ ok: false, error: "install_failed" });
    expect(await installer.execute(vi.fn())).toEqual({ ok: true, value: undefined });
  });
});
