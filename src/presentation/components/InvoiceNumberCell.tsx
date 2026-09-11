import { useId, useRef, useState } from "react";

interface InvoiceNumberCellProps {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly onCommit: (value: number) => Promise<string | null>;
}

export function InvoiceNumberCell({ label, value, min, onCommit }: InvoiceNumberCellProps) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const revision = useRef(0);
  const pendingRevision = useRef<number | null>(null);

  async function handleCommit(input: HTMLInputElement) {
    if (draft === null || pendingRevision.current === revision.current) return;
    if (!input.validity.valid) {
      setError(min === 1 ? "Nhập số nguyên từ 1 trở lên." : "Nhập số nguyên VND từ 0 trở lên.");
      return;
    }
    if (Number(draft) === value) {
      setDraft(null);
      setError(null);
      return;
    }
    const submittedRevision = revision.current;
    pendingRevision.current = submittedRevision;
    setIsSaving(true);
    const failure = await onCommit(Number(draft));
    if (pendingRevision.current === submittedRevision) {
      pendingRevision.current = null;
      setIsSaving(false);
    }
    if (revision.current !== submittedRevision) return;
    setError(failure);
    if (!failure) setDraft(null);
  }

  return (
    <div className={`invoice-number-cell ${min === 1 ? "quantity-cell" : ""}`}>
      <input
        id={id}
        className="table-input"
        type="number"
        inputMode="numeric"
        min={min}
        max={Number.MAX_SAFE_INTEGER}
        step="1"
        required
        aria-label={label}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        aria-busy={isSaving}
        data-dirty={draft !== null}
        value={draft ?? String(value)}
        onChange={(event) => {
          revision.current += 1;
          setDraft(event.target.value);
        }}
        onFocus={(event) => event.currentTarget.select()}
        onBlur={(event) => void handleCommit(event.currentTarget)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            revision.current += 1;
            setDraft(null);
            setError(null);
          }
          if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
          event.preventDefault();
          const fields = Array.from(
            event.currentTarget.closest("table")?.querySelectorAll<HTMLInputElement>("input") ?? [],
          );
          const next = fields[fields.indexOf(event.currentTarget) + (event.shiftKey ? -1 : 1)];
          // Moving focus commits through blur exactly once, just like Tab.
          if (next) next.focus();
          else event.currentTarget.blur();
        }}
      />
      {error && (
        <small id={`${id}-error`} className="invoice-field-error" role="alert">
          {error}
        </small>
      )}
    </div>
  );
}
