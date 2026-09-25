import type { PrinterService, PrintResult } from "../../application/ports/PrinterService";

export class WebviewPrintAdapter implements PrinterService {
  print(): Promise<PrintResult> {
    try {
      window.print();
      return Promise.resolve({ ok: true });
    } catch (err) {
      return Promise.resolve({
        ok: false,
        failure: { kind: "unknown", message: String(err) },
      });
    }
  }
}
