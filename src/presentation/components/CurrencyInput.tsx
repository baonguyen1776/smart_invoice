import React, { useId, useImperativeHandle, useLayoutEffect, useRef } from "react";
import {
  calculateNextCursorPosition,
  countDigitsBeforeCursor,
  formatVndCurrency,
  MAX_SAFE_VND,
  parseVndCurrency,
  stripNonDigits,
} from "../formatters/CurrencyFormatter";

export interface CurrencyInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type"
> {
  readonly value: number | string;
  readonly onValueChange?: (formattedValue: string, numericValue: number) => void;
  readonly onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  readonly maxSafeValue?: number;
  readonly inputRef?: React.Ref<HTMLInputElement>;
}

/**
 * Reusable input for real-time VND currency formatting with thousands separator (dot).
 * Preserves cursor position across mid-string additions and deletions.
 */
export function CurrencyInput({
  value,
  onValueChange,
  onChange,
  maxSafeValue = MAX_SAFE_VND,
  inputRef,
  className,
  ...restProps
}: CurrencyInputProps) {
  const localRef = useRef<HTMLInputElement>(null);
  const pendingCursorPosRef = useRef<number | null>(null);
  const generatedId = useId();
  const inputId = restProps.id || generatedId;

  // Connect local ref to forwarded or provided inputRef
  useImperativeHandle(inputRef, () => localRef.current as HTMLInputElement);

  // Formatted string to display (preserves invalid input during error state)
  const isInvalidString =
    typeof value === "string" &&
    (value.includes("-") ||
      value.includes(",") ||
      value.startsWith("0.") ||
      (stripNonDigits(value).length > 0 && !Number.isSafeInteger(Number(stripNonDigits(value)))));
  const displayValue = isInvalidString ? value : formatVndCurrency(value);

  // Restore cursor position after DOM updates
  useLayoutEffect(() => {
    if (localRef.current && pendingCursorPosRef.current !== null) {
      const pos = Math.min(pendingCursorPosRef.current, localRef.current.value.length);
      localRef.current.setSelectionRange(pos, pos);
      pendingCursorPosRef.current = null;
    }
  }, [displayValue]);

  function applyChange(rawInputString: string, targetDigitsBeforeCursor: number) {
    const isInvalid =
      rawInputString.includes("-") ||
      rawInputString.includes(",") ||
      rawInputString.startsWith("0.") ||
      (stripNonDigits(rawInputString).length > 0 &&
        !Number.isSafeInteger(Number(stripNonDigits(rawInputString))));

    if (isInvalid) {
      onValueChange?.(rawInputString, NaN);
      if (onChange && localRef.current) {
        const syntheticEvent = {
          target: { ...localRef.current, value: rawInputString, id: inputId },
          currentTarget: { ...localRef.current, value: rawInputString, id: inputId },
        } as unknown as React.ChangeEvent<HTMLInputElement>;
        onChange(syntheticEvent);
      }
      return;
    }

    const rawDigits = stripNonDigits(rawInputString);
    const num = parseVndCurrency(rawDigits);
    const clampedNum = Math.min(num, maxSafeValue);
    const formatted = rawDigits ? formatVndCurrency(clampedNum) : "";
    const nextCursor = calculateNextCursorPosition(formatted, targetDigitsBeforeCursor);
    pendingCursorPosRef.current = nextCursor;

    onValueChange?.(formatted, clampedNum);

    if (onChange && localRef.current) {
      const syntheticEvent = {
        target: { ...localRef.current, value: formatted, id: inputId },
        currentTarget: { ...localRef.current, value: formatted, id: inputId },
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      onChange(syntheticEvent);
    }
  }

  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const currentCursor = input.selectionStart ?? input.value.length;
    const digitsBefore = countDigitsBeforeCursor(input.value, currentCursor);
    applyChange(input.value, digitsBefore);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? 0;

    // Custom backspace handler when cursor is immediately after a dot separator
    if (event.key === "Backspace" && start === end && start > 0) {
      if (input.value[start - 1] === ".") {
        event.preventDefault();
        // Delete the digit before the dot
        const before = input.value.slice(0, Math.max(0, start - 2));
        const after = input.value.slice(start);
        const combined = before + after;
        const digitsBefore = countDigitsBeforeCursor(before, before.length);
        applyChange(combined, digitsBefore);
        return;
      }
    }

    // Custom delete handler when cursor is immediately before a dot separator
    if (event.key === "Delete" && start === end && start < input.value.length) {
      if (input.value[start] === ".") {
        event.preventDefault();
        // Delete the digit after the dot
        const before = input.value.slice(0, start);
        const after = input.value.slice(start + 2);
        const combined = before + after;
        const digitsBefore = countDigitsBeforeCursor(before, before.length);
        applyChange(combined, digitsBefore);
        return;
      }
    }

    restProps.onKeyDown?.(event);
  }

  return (
    <input
      {...restProps}
      id={inputId}
      ref={localRef}
      type="text"
      inputMode="numeric"
      className={className}
      value={displayValue}
      onChange={handleInputChange}
      onKeyDown={handleKeyDown}
    />
  );
}
