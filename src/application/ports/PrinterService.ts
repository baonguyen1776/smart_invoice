export type PrintFailure =
  { readonly kind: "dialog_blocked" } | { readonly kind: "unknown"; readonly message: string };

export type PrintResult =
  { readonly ok: true } | { readonly ok: false; readonly failure: PrintFailure };

export interface PrinterService {
  print(): Promise<PrintResult>;
}
