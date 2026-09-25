import { describe, expect, it, vi } from "vitest";
import type { PrinterCheck } from "../../application/ports/PrinterService";
import { WebviewPrintAdapter } from "./WebPrintAdapter";

describe("WebviewPrintAdapter", () => {
  it.each<PrinterCheck>([
    "no_printers",
    "printer_offline",
    "printer_paused",
    "printer_unavailable",
    "printer_check_failed",
  ])("does not open the dialog when the OS reports %s", async (status) => {
    const dialog = vi.fn();
    const adapter = new WebviewPrintAdapter(async () => status, dialog);
    expect(await adapter.print()).toEqual({ ok: false, failure: { kind: status } });
    expect(dialog).not.toHaveBeenCalled();
  });

  it("distinguishes inspection failure from missing hardware", async () => {
    const dialog = vi.fn();
    const adapter = new WebviewPrintAdapter(async () => {
      throw new Error("IPC unavailable");
    }, dialog);
    expect(await adapter.print()).toEqual({ ok: false, failure: { kind: "printer_check_failed" } });
    expect(dialog).not.toHaveBeenCalled();
  });

  it("waits for OS inspection before opening the dialog", async () => {
    let finish!: (value: PrinterCheck) => void;
    const check = new Promise<PrinterCheck>((resolve) => {
      finish = resolve;
    });
    const dialog = vi.fn();
    const request = new WebviewPrintAdapter(() => check, dialog).print();
    expect(dialog).not.toHaveBeenCalled();
    finish("no_reported_error");
    expect(await request).toEqual({ ok: true });
    expect(dialog).toHaveBeenCalledTimes(1);
  });

  it("reports failure to open the OS dialog", async () => {
    const adapter = new WebviewPrintAdapter(
      async () => "no_reported_error",
      () => {
        throw new Error("dialog unavailable");
      },
    );
    expect(await adapter.print()).toEqual({ ok: false, failure: { kind: "dialog_blocked" } });
  });
});
