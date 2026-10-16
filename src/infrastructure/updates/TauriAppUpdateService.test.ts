import type { DownloadEvent } from "@tauri-apps/plugin-updater";
import { describe, expect, it, vi } from "vitest";
import { TauriAppUpdateService } from "./TauriAppUpdateService";

function preparedUpdate() {
  return {
    version: "0.1.2",
    body: "Sửa lỗi hiển thị",
    close: vi.fn(async () => {}),
    downloadAndInstall: vi.fn(async (onEvent?: (event: DownloadEvent) => void) => {
      onEvent?.({ event: "Started", data: { contentLength: 10 } });
      onEvent?.({ event: "Progress", data: { chunkLength: 4 } });
      onEvent?.({ event: "Progress", data: { chunkLength: 6 } });
      onEvent?.({ event: "Finished" });
    }),
  };
}

describe("TauriAppUpdateService", () => {
  it("does not contact the updater when disabled for browser/dev/non-Windows runs", async () => {
    const checker = vi.fn();
    expect(await new TauriAppUpdateService(false, checker).check()).toBeNull();
    expect(await new TauriAppUpdateService(undefined, checker).check()).toBeNull();
    expect(checker).not.toHaveBeenCalled();
  });

  it("uses a bounded check and exposes only application metadata", async () => {
    const checker = vi.fn(async () => preparedUpdate());
    expect(await new TauriAppUpdateService(true, checker).check()).toEqual({
      version: "0.1.2",
      notes: "Sửa lỗi hiển thị",
    });
    expect(checker).toHaveBeenCalledWith({ timeout: 5000 });
  });

  it("handles no newer version", async () => {
    expect(await new TauriAppUpdateService(true, async () => null).check()).toBeNull();
  });

  it("refuses installation without a checked update", async () => {
    await expect(new TauriAppUpdateService(true).install(vi.fn())).rejects.toThrow("No app update");
  });

  it("accumulates download bytes and reports the installation phase", async () => {
    const update = preparedUpdate();
    const updater = new TauriAppUpdateService(true, async () => update);
    await updater.check();
    const progress = vi.fn();
    await updater.install(progress);
    expect(progress.mock.calls.map(([value]) => value)).toEqual([
      { phase: "downloading", downloadedBytes: 0, totalBytes: 10 },
      { phase: "downloading", downloadedBytes: 4, totalBytes: 10 },
      { phase: "downloading", downloadedBytes: 10, totalBytes: 10 },
      { phase: "installing", downloadedBytes: 10, totalBytes: 10 },
    ]);
  });

  it("supports a server that omits content length", async () => {
    const update = preparedUpdate();
    update.downloadAndInstall.mockImplementation(async (callback) => {
      callback?.({ event: "Started", data: {} });
      callback?.({ event: "Progress", data: { chunkLength: 3 } });
    });
    const updater = new TauriAppUpdateService(true, async () => update);
    await updater.check();
    const progress = vi.fn();
    await updater.install(progress);
    expect(progress).toHaveBeenLastCalledWith({
      phase: "downloading",
      downloadedBytes: 3,
      totalBytes: undefined,
    });
  });

  it("propagates verification failures and resets progress on retry", async () => {
    const update = preparedUpdate();
    update.downloadAndInstall.mockRejectedValueOnce(new Error("invalid signature"));
    const updater = new TauriAppUpdateService(true, async () => update);
    await updater.check();
    await expect(updater.install(vi.fn())).rejects.toThrow("invalid signature");
    const progress = vi.fn();
    await updater.install(progress);
    expect(progress).toHaveBeenLastCalledWith({
      phase: "installing",
      downloadedBytes: 10,
      totalBytes: 10,
    });
  });

  it("releases dismissed update resources and prevents subsequent installation", async () => {
    const update = preparedUpdate();
    const updater = new TauriAppUpdateService(true, async () => update);
    await updater.check();
    await updater.dismiss();
    await updater.dismiss();
    expect(update.close).toHaveBeenCalledTimes(1);
    await expect(updater.install(vi.fn())).rejects.toThrow("No app update");
    expect(update.downloadAndInstall).not.toHaveBeenCalled();
  });
});
