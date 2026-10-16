import { StrictMode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  AppUpdateInfo,
  AppUpdateProgress,
  AppUpdateService,
} from "../../application/ports/AppUpdateService";
import { CheckForAppUpdate } from "../../application/use-cases/CheckForAppUpdate";
import { InstallAppUpdate } from "../../application/use-cases/InstallAppUpdate";
import { AppUpdateStartup } from "./AppUpdateStartup";

function setup(overrides: Partial<AppUpdateService> = {}, strict = false) {
  const service: AppUpdateService = {
    check: vi.fn(async () => ({ version: "0.1.2", notes: "Sửa lỗi hóa đơn" })),
    dismiss: vi.fn(async () => {}),
    install: vi.fn(async () => {}),
    ...overrides,
  };
  const gate = (
    <AppUpdateStartup
      checker={new CheckForAppUpdate(service)}
      installer={new InstallAppUpdate(service)}
    >
      <div>Màn hình hóa đơn</div>
    </AppUpdateStartup>
  );
  render(strict ? <StrictMode>{gate}</StrictMode> : gate);
  return service;
}

describe("AppUpdateStartup", () => {
  it("does not mount the editor or install anything before user confirmation", async () => {
    const service = setup();
    expect(await screen.findByRole("heading", { name: "Đã có phiên bản 0.1.2" })).toBeVisible();
    expect(screen.getByText("Sửa lỗi hóa đơn")).toBeVisible();
    expect(screen.queryByText("Màn hình hóa đơn")).not.toBeInTheDocument();
    expect(service.install).not.toHaveBeenCalled();
  });

  it("opens the editor and releases the update when the user chooses later", async () => {
    const service = setup();
    fireEvent.click(await screen.findByRole("button", { name: "Để sau" }));
    expect(screen.getByText("Màn hình hóa đơn")).toBeVisible();
    await waitFor(() => expect(service.dismiss).toHaveBeenCalledTimes(1));
    expect(service.install).not.toHaveBeenCalled();
  });

  it.each(["no update", "offline"])("opens the app when there is %s", async (scenario) => {
    setup({
      check:
        scenario === "offline"
          ? vi.fn(async () => {
              throw new Error("offline");
            })
          : vi.fn(async () => null),
    });
    expect(await screen.findByText("Màn hình hóa đơn")).toBeVisible();
  });

  it("ignores a late available update after the user skips checking", async () => {
    let resolve!: (value: AppUpdateInfo) => void;
    const service = setup({
      check: vi.fn(
        () =>
          new Promise<AppUpdateInfo>((done) => {
            resolve = done;
          }),
      ),
    });
    fireEvent.click(screen.getByRole("button", { name: "Mở ứng dụng" }));
    expect(screen.getByText("Màn hình hóa đơn")).toBeVisible();
    await act(async () => {
      resolve({ version: "0.1.2" });
    });
    expect(screen.queryByRole("button", { name: "Cập nhật" })).not.toBeInTheDocument();
    await waitFor(() => expect(service.dismiss).toHaveBeenCalledTimes(1));
  });

  it("shows progress and prevents entering the editor while installation is running", async () => {
    let finish!: () => void;
    const service = setup({
      install: vi.fn((progress: (value: AppUpdateProgress) => void) => {
        progress({ phase: "downloading", downloadedBytes: 5, totalBytes: 10 });
        return new Promise<void>((done) => {
          finish = done;
        });
      }),
    });
    fireEvent.click(await screen.findByRole("button", { name: "Cập nhật" }));
    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "5");
    expect(screen.queryByText("Màn hình hóa đơn")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Để sau" })).not.toBeInTheDocument();
    expect(service.install).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish();
    });
    expect(screen.getByRole("heading", { name: "Đã cài bản cập nhật" })).toBeVisible();
    expect(screen.queryByText("Màn hình hóa đơn")).not.toBeInTheDocument();
  });

  it("keeps progress indeterminate when download size is unknown", async () => {
    setup({
      install: vi.fn((progress: (value: AppUpdateProgress) => void) => {
        progress({ phase: "downloading", downloadedBytes: 5 });
        return new Promise<void>(() => {});
      }),
    });
    fireEvent.click(await screen.findByRole("button", { name: "Cập nhật" }));
    expect(screen.getByRole("progressbar")).not.toHaveAttribute("value");
  });

  it("lets the user retry an installation failure or continue using the installed app", async () => {
    const install = vi.fn(async () => {
      throw new Error("signature rejected");
    });
    setup({ install });
    fireEvent.click(await screen.findByRole("button", { name: "Cập nhật" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Chưa cập nhật được");
    fireEvent.click(screen.getByRole("button", { name: "Thử cập nhật lại" }));
    await waitFor(() => expect(install).toHaveBeenCalledTimes(2));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Để sau" }));
    expect(screen.getByText("Màn hình hóa đơn")).toBeVisible();
  });

  it("checks only once under StrictMode", async () => {
    const service = setup({}, true);
    await screen.findByRole("button", { name: "Cập nhật" });
    expect(service.check).toHaveBeenCalledTimes(1);
  });
});
