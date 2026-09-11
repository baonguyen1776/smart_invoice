export type InvoiceRepositoryOperation =
  | "create_draft"
  | "get"
  | "save_draft"
  | "complete"
  | "overwrite_completed"
  | "list"
  | "delete_draft";

export interface InvoiceValidationFailure {
  readonly code: "validation";
  readonly message: string;
}

export interface InvoiceInvalidState {
  readonly code: "invalid_state";
  readonly message: string;
}

export interface InvoiceNotFound {
  readonly code: "not_found";
  readonly invoiceId: string;
}

export interface InvoiceItemNotFound {
  readonly code: "item_not_found";
  readonly itemId: string;
}

export interface InvoiceConfirmationRequired {
  readonly code: "confirmation_required";
}

export interface InvoicePersistenceFailure {
  readonly code: "persistence";
  readonly operation: InvoiceRepositoryOperation;
  readonly message: string;
}

export type InvoiceError =
  | InvoiceValidationFailure
  | InvoiceInvalidState
  | InvoiceNotFound
  | InvoiceItemNotFound
  | InvoiceConfirmationRequired
  | InvoicePersistenceFailure;
