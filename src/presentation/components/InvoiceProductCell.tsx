import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { SearchProducts } from "../../application/use-cases/SearchProducts";
import type { Product } from "../../domain/entities/Product";

interface InvoiceProductCellProps {
  readonly value: string;
  readonly label: string;
  readonly isDirty: boolean;
  readonly error?: string;
  readonly searchProducts: Pick<SearchProducts, "execute">;
  readonly onChange: (value: string) => void;
  readonly onSelect: (product: Product) => void;
  readonly onBlur: () => void;
  readonly onNavigateToProducts?: (query: string) => void;
}

export function InvoiceProductCell(props: InvoiceProductCellProps) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 300 });
  const result = isOpen && props.value.trim()
    ? props.searchProducts.execute({ query: props.value, limit: 10 }) : null;
  const candidates = result?.ok ? result.value : [];
  const showSuggestions = isOpen && Boolean(props.value.trim());

  useLayoutEffect(() => {
    if (!showSuggestions) return;
    function place() {
      const rect = input.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(Math.max(rect.width, 300), window.innerWidth - 24);
      setPosition({
        left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
        top: window.innerHeight - rect.bottom < 260 ? Math.max(12, rect.top - 252) : rect.bottom + 4,
        width,
      });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [showSuggestions]);
  useEffect(() => {
    if (showSuggestions) document.getElementById(`${id}-${highlighted}`)?.scrollIntoView?.({ block: "nearest" });
  }, [highlighted, id, showSuggestions]);

  function select(product: Product) {
    props.onSelect(product);
    setIsOpen(false);
    input.current?.closest("tr")?.querySelector<HTMLSelectElement>("select")?.focus();
  }

  return <>
    <input
      ref={input}
      className="invoice-grid-input invoice-grid-product"
      data-grid-cell="true"
      data-product-input="true"
      data-dirty={props.isDirty}
      aria-label={props.label}
      aria-invalid={Boolean(props.error)}
      aria-describedby={props.error ? `${id}-error` : undefined}
      role="combobox"
      aria-autocomplete="list"
      aria-expanded={showSuggestions}
      aria-controls={showSuggestions && candidates.length ? `${id}-list` : undefined}
      aria-activedescendant={showSuggestions && candidates[highlighted] ? `${id}-${highlighted}` : undefined}
      autoComplete="off"
      placeholder="-"
      value={props.value}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => {
        props.onChange(event.target.value);
        setHighlighted(0);
        setIsOpen(true);
      }}
      onBlur={() => { setIsOpen(false); props.onBlur(); }}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === "Escape") { setIsOpen(false); return; }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          setIsOpen(true);
          if (candidates.length) setHighlighted((current) => (current + (event.key === "ArrowDown" ? 1 : candidates.length - 1)) % candidates.length);
        }
        if ((event.key === "Enter" || (event.key === "Tab" && !event.shiftKey)) && showSuggestions && candidates[highlighted]) {
          event.preventDefault();
          select(candidates[highlighted].product);
        }
      }}
    />
    {props.error && <small id={`${id}-error`} className="invoice-field-error" role="alert">{props.error}</small>}
    {showSuggestions && createPortal(
      <div className="invoice-grid-suggestions" style={position} onMouseDown={(event) => event.preventDefault()}>
        {candidates.length ? <ul id={`${id}-list`} role="listbox" aria-label="Sản phẩm phù hợp">
          {candidates.map(({ product, activeUnitNames }, index) => <li
            key={product.id} id={`${id}-${index}`} role="option" aria-selected={highlighted === index}
            onMouseEnter={() => setHighlighted(index)} onClick={() => select(product)}
          ><strong>{product.name}</strong><small>{[product.sku, ...activeUnitNames].filter(Boolean).join(" · ")}</small></li>)}
        </ul> : <div className="invoice-grid-no-results">
          <span>{result && !result.ok ? "Chưa tải được danh mục." : "Không tìm thấy hàng hóa."}</span>
          {result?.ok && props.onNavigateToProducts && <button type="button" className="secondary-button" onClick={() => props.onNavigateToProducts?.(props.value.trim())}>Thêm sản phẩm mới vào danh mục</button>}
        </div>}
      </div>, document.body,
    )}
  </>;
}
