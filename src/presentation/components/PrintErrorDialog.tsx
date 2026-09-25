import { useEffect, useRef } from "react";
import { InvoiceIcon } from "./InvoiceIcon";

export function PrintErrorDialog({
  title,
  message,
  onClose,
  onRetry,
}: {
  readonly title: string;
  readonly message: string;
  readonly onClose: () => void;
  readonly onRetry: () => void;
}) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const retryButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement;
    closeButton.current?.focus();
    return () => {
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  return (
    <div className="receipt-error-backdrop no-print" onClick={(event) => event.stopPropagation()}>
      <div
        className="receipt-error-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="receipt-error-title"
        aria-describedby="receipt-error-message"
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          } else if (event.key === "Tab") {
            event.preventDefault();
            if (document.activeElement === closeButton.current) retryButton.current?.focus();
            else closeButton.current?.focus();
          }
        }}
      >
        <div className="receipt-error-heading">
          <InvoiceIcon name="alert" size={24} />
          <h3 id="receipt-error-title">{title}</h3>
        </div>
        <p id="receipt-error-message" role="alert">
          {message}
        </p>
        <div className="receipt-error-actions">
          <button ref={closeButton} type="button" className="secondary-button" onClick={onClose}>
            Đóng
          </button>
          <button ref={retryButton} type="button" className="primary-button" onClick={onRetry}>
            Thử lại
          </button>
        </div>
      </div>
    </div>
  );
}
