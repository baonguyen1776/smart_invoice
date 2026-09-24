import { invoke } from "@tauri-apps/api/core";
import type {
  PrinterCheck,
  PrinterService,
  PrintResult,
} from "../../application/ports/PrinterService";

export class WebviewPrintAdapter implements PrinterService {
  constructor(
    private readonly checkPrinters: () => Promise<PrinterCheck> = () => invoke("check_printers"),
    private readonly openDialog: () => void = () => window.print(),
  ) {}

  async print(): Promise<PrintResult> {
    let check: PrinterCheck;
    try {
      check = await this.checkPrinters();
    } catch {
      return { ok: false, failure: { kind: "printer_check_failed" } };
    }
    if (check !== "no_reported_error") return { ok: false, failure: { kind: check } };
    try {
      this.openDialog();
      return { ok: true };
    } catch {
      return { ok: false, failure: { kind: "dialog_blocked" } };
    }
  }
}
