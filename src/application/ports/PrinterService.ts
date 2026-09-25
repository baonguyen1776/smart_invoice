export type PrinterCheck =
  | "no_reported_error"
  | "no_printers"
  | "printer_offline"
  | "printer_paused"
  | "printer_unavailable"
  | "printer_check_failed";

export type PrintFailure =
  | { readonly kind: Exclude<PrinterCheck, "no_reported_error"> | "dialog_blocked" }
  | { readonly kind: "unknown"; readonly message: string };

export type PrintResult =
  { readonly ok: true } | { readonly ok: false; readonly failure: PrintFailure };

export interface PrinterService {
  // Success only means the dialog returned, never that paper was printed.
  print(): Promise<PrintResult>;
}
