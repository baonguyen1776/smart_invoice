import { WorkspaceSidebar } from "../components/WorkspaceSidebar";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { InvoiceIcon } from "../components/InvoiceIcon";
import { CurrencyInput } from "../components/CurrencyInput";
import { formatVndCurrency, stripNonDigits } from "../formatters/CurrencyFormatter";
import type { ProductCatalogError } from "../../application/errors/ProductCatalogError";
import type { Result } from "../../application/shared/Result";
import type { CreateProduct, CreateProductInput } from "../../application/use-cases/CreateProduct";
import type { DeactivateProduct } from "../../application/use-cases/DeactivateProduct";
import type { ListProducts } from "../../application/use-cases/ListProducts";
import type { ReactivateProduct } from "../../application/use-cases/ReactivateProduct";
import type {
  UpdateProduct,
  UpdateProductUnitInput,
} from "../../application/use-cases/UpdateProduct";
import type { Product } from "../../domain/entities/Product";
import { ProductImportDialog, type ProductImportActions } from "../components/ProductImportDialog";

export interface ProductManagementActions {
  readonly createProduct: Pick<CreateProduct, "execute">;
  readonly updateProduct: Pick<UpdateProduct, "execute">;
  readonly deactivateProduct: Pick<DeactivateProduct, "execute">;
  readonly reactivateProduct?: Pick<ReactivateProduct, "execute">;
  readonly listProducts: Pick<ListProducts, "execute">;
  readonly productImport?: ProductImportActions;
}

export interface ProductManagementScreenProps {
  readonly actions: ProductManagementActions;
  readonly onNavigate?: (screen: "invoice" | "products" | "history") => void;
  readonly activeScreen?: "invoice" | "products" | "history";
  readonly initialCreateQuery?: string;
  readonly isCalculatorOpen?: boolean;
  readonly onToggleCalculator?: () => void;
}
interface UnitDraft {
  readonly key: string;
  readonly id: string | null;
  readonly name: string;
  readonly price: string;
}
interface ProductDraft {
  readonly name: string;
  readonly sku: string;
  readonly brand: string;
  readonly category: string;
  readonly units: readonly UnitDraft[];
}

const EMPTY_DRAFT: ProductDraft = {
  name: "",
  sku: "",
  brand: "",
  category: "",
  units: [{ key: "new-0", id: null, name: "", price: "" }],
};

export function ProductManagementScreen({
  actions,
  onNavigate,
  activeScreen = "products",
  initialCreateQuery,
  isCalculatorOpen = false,
  onToggleCalculator,
}: ProductManagementScreenProps) {
  const [products, setProducts] = useState<readonly Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(() =>
    Boolean(initialCreateQuery && initialCreateQuery.trim().length > 0),
  );
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productPendingDeactivation, setProductPendingDeactivation] = useState<Product | null>(
    null,
  );
  const [draft, setDraft] = useState<ProductDraft>(() => {
    if (initialCreateQuery && initialCreateQuery.trim().length > 0) {
      return {
        ...EMPTY_DRAFT,
        name: initialCreateQuery.trim(),
      };
    }
    return EMPTY_DRAFT;
  });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deactivationError, setDeactivationError] = useState<string | null>(null);
  const [isReactivating, setIsReactivating] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "inactive" | "all">("active");
  const [brandFilter, setBrandFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  const brands = useMemo(() => uniqueValues(products.map((product) => product.brand)), [products]);
  const categories = useMemo(
    () => uniqueValues(products.map((product) => product.category)),
    [products],
  );
  const visibleProducts = useMemo(() => {
    const normalizedQuery = normalizeSearch(query);
    return products.filter((product) => {
      const matchesQuery =
        normalizedQuery === "" ||
        [product.name, product.sku, product.brand, product.category]
          .filter((value): value is string => value !== null)
          .some((value) => normalizeSearch(value).includes(normalizedQuery));
      return (
        matchesQuery &&
        (brandFilter === "" || product.brand === brandFilter) &&
        (categoryFilter === "" || product.category === categoryFilter)
      );
    });
  }, [brandFilter, categoryFilter, products, query]);

  const loadProducts = useCallback(
    async (manual = false) => {
      if (manual) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      const minDelay = manual
        ? new Promise((resolve) => setTimeout(resolve, 750))
        : Promise.resolve();
      try {
        const [result] = await Promise.all([
          actions.listProducts.execute({ activity: statusFilter }),
          minDelay,
        ]);
        if (!result.ok) {
          setError(toUserMessage(result.error));
          return;
        }
        setProducts(result.value);
        setError(null);
      } catch {
        setError("Không thể tải danh mục sản phẩm.");
      } finally {
        if (manual) {
          setIsRefreshing(false);
        } else {
          setIsLoading(false);
        }
      }
    },
    [actions.listProducts, statusFilter],
  );

  useEffect(() => {
    let isCancelled = false;

    void actions.listProducts.execute({ activity: statusFilter }).then((result) => {
      if (isCancelled) return;
      setIsLoading(false);
      if (!result.ok) {
        setError(toUserMessage(result.error));
        return;
      }
      setProducts(result.value);
    });

    return () => {
      isCancelled = true;
    };
  }, [actions.listProducts, statusFilter]);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => {
      setMessage(null);
    }, 3000);
    return () => clearTimeout(timer);
  }, [message]);

  function openCreateForm() {
    setEditingProduct(null);
    setDraft(EMPTY_DRAFT);
    setError(null);
    setMessage(null);
    setIsFormOpen(true);
  }

  function openEditForm(product: Product) {
    setEditingProduct(product);
    setDraft({
      name: product.name,
      sku: product.sku ?? "",
      brand: product.brand ?? "",
      category: product.category ?? "",
      units: product.units
        .filter((unit) => unit.isActive)
        .map((unit) => ({
          key: unit.id,
          id: unit.id,
          name: unit.name,
          price: formatVndCurrency(unit.price),
        })),
    });
    setError(null);
    setMessage(null);
    setIsFormOpen(true);
  }

  function closeForm() {
    setIsFormOpen(false);
    setEditingProduct(null);
    setDraft(EMPTY_DRAFT);
  }

  function updateUnit(key: string, field: "name" | "price", value: string) {
    setDraft((current) => ({
      ...current,
      units: current.units.map((unit) => (unit.key === key ? { ...unit, [field]: value } : unit)),
    }));
  }

  function addUnit() {
    setDraft((current) => ({
      ...current,
      units: [
        ...current.units,
        { key: `new-${crypto.randomUUID()}`, id: null, name: "", price: "" },
      ],
    }));
  }

  function removeUnit(key: string) {
    if (draft.units.length === 1) {
      setError("Sản phẩm phải có ít nhất một đơn vị đang hoạt động.");
      return;
    }
    setDraft((current) => ({
      ...current,
      units: current.units.filter((unit) => unit.key !== key),
    }));
    setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    const units = parseUnits(draft.units);
    if (!units.ok) {
      setError(units.error);
      return;
    }
    setIsSaving(true);
    const fields = {
      name: draft.name,
      sku: optionalText(draft.sku),
      brand: optionalText(draft.brand),
      category: optionalText(draft.category),
    };
    const result = editingProduct
      ? await actions.updateProduct.execute({
          ...fields,
          productId: editingProduct.id,
          units: units.value.map((unit): UpdateProductUnitInput =>
            unit.id === null
              ? { kind: "new", name: unit.name, price: unit.price }
              : { kind: "existing", id: unit.id, name: unit.name, price: unit.price },
          ),
        })
      : await actions.createProduct.execute({
          ...fields,
          units: units.value.map(({ name, price }) => ({ name, price })),
        } satisfies CreateProductInput);
    setIsSaving(false);
    if (!result.ok) {
      setError(toUserMessage(result.error));
      return;
    }
    const successMessage = editingProduct ? "Đã cập nhật sản phẩm." : "Đã thêm sản phẩm.";
    closeForm();
    setMessage(successMessage);
    await loadProducts();
  }

  async function handleDeactivate(product: Product) {
    setIsDeactivating(true);
    setDeactivationError(null);
    setMessage(null);
    const result = await actions.deactivateProduct.execute({ productId: product.id });
    setIsDeactivating(false);
    if (!result.ok) {
      setDeactivationError(toUserMessage(result.error));
      return;
    }
    setProductPendingDeactivation(null);
    setMessage("Đã ngừng sử dụng sản phẩm.");
    await loadProducts();
  }

  async function handleReactivate(product: Product) {
    if (!actions.reactivateProduct) return;
    setIsReactivating(true);
    setError(null);
    const result = await actions.reactivateProduct.execute({ productId: product.id });
    setIsReactivating(false);
    if (!result.ok) {
      setError(toUserMessage(result.error));
      return;
    }
    await loadProducts();
  }

  return (
    <div className="app-frame">
      <WorkspaceSidebar
        activeScreen={activeScreen}
        onNavigate={onNavigate}
        isCalculatorOpen={isCalculatorOpen}
        onToggleCalculator={onToggleCalculator}
      />

      <main className="workspace product-workspace">
        <h1 className="sr-only">Quản lý sản phẩm</h1>

        <header className="history-header product-screen-header">
          <div className="history-search-wrapper product-search-wrapper">
            <input
              type="text"
              className="history-search-input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm theo tên, mã, thương hiệu…"
              aria-label="Tìm sản phẩm"
            />
            <span className="history-search-icon">
              <InvoiceIcon name="search" size={20} />
            </span>
          </div>

          <div className="history-actions product-header-actions">
            <div className="panel-heading product-count-badge-wrap">
              <h2 id="catalog-title" className="sr-only">
                Danh sách sản phẩm
              </h2>
              <span className="stat-badge products" aria-label="Số lượng sản phẩm">
                <strong>{products.length}</strong> sản phẩm
              </span>
            </div>

            <div className="product-filter-group">
              <label className="filter-select-label">
                <span className="sr-only">Lọc theo trạng thái</span>
                <select
                  className="history-select-filter"
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(event.target.value as "active" | "inactive" | "all")
                  }
                  aria-label="Lọc theo trạng thái"
                >
                  <option value="active">Đang bán</option>
                  <option value="inactive">Đã ngừng bán</option>
                  <option value="all">Tất cả trạng thái</option>
                </select>
              </label>
              {brands.length > 0 && (
                <label className="filter-select-label">
                  <span className="sr-only">Lọc theo thương hiệu</span>
                  <select
                    className="history-select-filter"
                    value={brandFilter}
                    onChange={(event) => setBrandFilter(event.target.value)}
                    aria-label="Lọc theo thương hiệu"
                  >
                    <option value="">Tất cả thương hiệu</option>
                    {brands.map((brand) => (
                      <option key={brand} value={brand}>
                        {brand}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {categories.length > 0 && (
                <label className="filter-select-label">
                  <span className="sr-only">Lọc theo nhóm sản phẩm</span>
                  <select
                    className="history-select-filter"
                    value={categoryFilter}
                    onChange={(event) => setCategoryFilter(event.target.value)}
                    aria-label="Lọc theo nhóm sản phẩm"
                  >
                    <option value="">Tất cả nhóm hàng</option>
                    {categories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            <button
              className={`refresh-button history-pill-btn ${isRefreshing ? "is-refreshing" : ""}`}
              type="button"
              onClick={() => void loadProducts(true)}
              aria-label="Làm mới danh sách"
              disabled={isLoading || isRefreshing}
            >
              <span
                className={`refresh-icon-wrap ${isRefreshing || isLoading ? "spin-linear" : ""}`}
              >
                <InvoiceIcon name="refresh" size={16} />
              </span>
              <span>Làm mới</span>
            </button>
            <button
              className="secondary-button history-pill-btn"
              type="button"
              onClick={() => setIsImportOpen(true)}
              disabled={!actions.productImport}
            >
              <span>Import</span>
            </button>
            <button
              className="primary-button history-primary-btn"
              type="button"
              onClick={openCreateForm}
            >
              <InvoiceIcon name="plus" size={15} />
              <span>Thêm sản phẩm</span>
            </button>
          </div>
        </header>

        {message && (
          <aside className="notice toast success" role="status">
            <span>{message}</span>
            <button
              type="button"
              className="toast-close"
              onClick={() => setMessage(null)}
              aria-label="Đóng thông báo"
            >
              ×
            </button>
          </aside>
        )}
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}

        <section className="catalog-panel" aria-labelledby="catalog-title">
          {isLoading ? (
            <p className="empty-state" role="status">
              Đang tải danh mục…
            </p>
          ) : products.length === 0 ? (
            <div className="empty-state">
              <strong>
                {statusFilter === "inactive" ? "Không có sản phẩm ngưng bán" : "Chưa có sản phẩm"}
              </strong>
              {statusFilter !== "inactive" && (
                <button className="primary-button" type="button" onClick={openCreateForm}>
                  Thêm sản phẩm
                </button>
              )}
            </div>
          ) : visibleProducts.length === 0 ? (
            <div className="empty-state">
              <strong>Không tìm thấy sản phẩm</strong>
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  setQuery("");
                  setBrandFilter("");
                  setCategoryFilter("");
                }}
              >
                Xóa bộ lọc
              </button>
            </div>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Sản phẩm</th>
                    <th>Mã sản phẩm</th>
                    <th>Phân loại</th>
                    <th>Đơn vị &amp; giá bán</th>
                    <th>Trạng thái</th>
                    <th>
                      <span className="sr-only">Thao tác</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleProducts.map((product) => (
                    <tr key={product.id}>
                      <td>
                        <div className="product-cell">
                          <span className="product-avatar" aria-hidden="true">
                            {initials(product.name)}
                          </span>
                          <div>
                            <strong title={product.name}>{product.name}</strong>
                            <small title={product.brand ?? undefined}>
                              {product.brand ?? "Chưa có thương hiệu"}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span
                          className={product.sku ? "product-code" : "muted"}
                          title={product.sku ?? undefined}
                        >
                          {product.sku ?? "Chưa đặt mã"}
                        </span>
                      </td>
                      <td>
                        {product.category ? (
                          <span className="category-chip" title={product.category}>
                            {product.category}
                          </span>
                        ) : (
                          <span className="muted">Chưa phân nhóm</span>
                        )}
                      </td>
                      <td>
                        <div className="price-list">
                          {product.units
                            .filter((unit) => unit.isActive)
                            .map((unit) => (
                              <span key={unit.id}>
                                <small title={unit.name}>{unit.name}</small>
                                <strong>{formatVnd(unit.price)}</strong>
                              </span>
                            ))}
                        </div>
                      </td>
                      <td>
                        <span
                          className={`status-badge ${product.isActive ? "active" : "inactive"}`}
                        >
                          <i aria-hidden="true" />
                          {product.isActive ? "Đang bán" : "Ngưng bán"}
                        </span>
                      </td>
                      <td>
                        <div className="row-actions">
                          {product.isActive ? (
                            <>
                              <button
                                className="icon-action"
                                type="button"
                                onClick={() => openEditForm(product)}
                                aria-label={`Chỉnh sửa ${product.name}`}
                                title="Chỉnh sửa"
                              >
                                <EditIcon />
                              </button>
                              <button
                                className="icon-action danger-link"
                                type="button"
                                onClick={() => {
                                  setDeactivationError(null);
                                  setProductPendingDeactivation(product);
                                }}
                                aria-label={`Ngừng bán ${product.name}`}
                                title="Ngừng bán"
                              >
                                <DeactivateIcon />
                              </button>
                            </>
                          ) : (
                            <button
                              className="reactivate-button"
                              type="button"
                              onClick={() => void handleReactivate(product)}
                              disabled={isReactivating}
                              aria-label={`Kích hoạt lại ${product.name}`}
                              title="Kích hoạt lại"
                            >
                              Kích hoạt lại
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        {isFormOpen && (
          <div className="modal-backdrop" role="presentation">
            <section
              className="product-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="product-form-title"
            >
              <div className="dialog-heading">
                <div>
                  <p className="eyebrow">{editingProduct ? "Chỉnh sửa" : "Sản phẩm mới"}</p>
                  <h2 id="product-form-title">
                    {editingProduct ? editingProduct.name : "Thêm sản phẩm"}
                  </h2>
                </div>
                <button className="icon-button" type="button" aria-label="Đóng" onClick={closeForm}>
                  ×
                </button>
              </div>
              <form onSubmit={(event) => void handleSubmit(event)}>
                <div className="form-grid">
                  <label>
                    <span className="field-label">
                      Tên sản phẩm <span aria-hidden="true">*</span>
                    </span>
                    <input
                      required
                      value={draft.name}
                      onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                      placeholder="Ví dụ: Cà phê rang xay"
                    />
                  </label>
                  <label>
                    <span className="field-label">
                      Mã sản phẩm <span className="optional-label">(không bắt buộc)</span>
                    </span>
                    <input
                      value={draft.sku}
                      onChange={(event) => setDraft({ ...draft, sku: event.target.value })}
                      placeholder="Ví dụ: CF-001"
                    />
                  </label>
                  <label>
                    <span className="field-label">
                      Thương hiệu <span className="optional-label">(không bắt buộc)</span>
                    </span>
                    <input
                      value={draft.brand}
                      onChange={(event) => setDraft({ ...draft, brand: event.target.value })}
                      list="brand-suggestions"
                      placeholder="Chọn hoặc nhập mới"
                    />
                  </label>
                  <label>
                    <span className="field-label">
                      Nhóm sản phẩm <span className="optional-label">(không bắt buộc)</span>
                    </span>
                    <input
                      value={draft.category}
                      onChange={(event) => setDraft({ ...draft, category: event.target.value })}
                      list="category-suggestions"
                      placeholder="Chọn hoặc nhập mới"
                    />
                  </label>
                  <datalist id="brand-suggestions">
                    {brands.map((brand) => (
                      <option key={brand} value={brand} />
                    ))}
                  </datalist>
                  <datalist id="category-suggestions">
                    {categories.map((category) => (
                      <option key={category} value={category} />
                    ))}
                  </datalist>
                </div>
                <fieldset className="units-fieldset">
                  <div className="units-heading">
                    <div>
                      <legend>
                        Đơn vị bán <span aria-hidden="true">*</span>
                      </legend>
                    </div>
                    <button className="secondary-button" type="button" onClick={addUnit}>
                      + Thêm đơn vị
                    </button>
                  </div>
                  {draft.units.map((unit, index) => (
                    <div className="unit-row" key={unit.key}>
                      <label>
                        Tên đơn vị
                        <input
                          required
                          value={unit.name}
                          onChange={(event) => updateUnit(unit.key, "name", event.target.value)}
                          placeholder="Ví dụ: Chai"
                        />
                      </label>
                      <label>
                        Giá bán (VND)
                        <CurrencyInput
                          required
                          value={unit.price}
                          onValueChange={(formatted) => updateUnit(unit.key, "price", formatted)}
                          placeholder="0"
                          aria-label={`Giá bán đơn vị ${index + 1}`}
                        />
                      </label>
                      <button
                        className="remove-unit"
                        type="button"
                        onClick={() => removeUnit(unit.key)}
                        aria-label={`Xóa đơn vị ${index + 1}`}
                      >
                        Xóa
                      </button>
                    </div>
                  ))}
                </fieldset>
                <div className="dialog-actions">
                  <button className="secondary-button" type="button" onClick={closeForm}>
                    Hủy
                  </button>
                  <button className="primary-button" type="submit" disabled={isSaving}>
                    {isSaving ? "Đang lưu…" : "Lưu sản phẩm"}
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}
        {isImportOpen && actions.productImport && (
          <ProductImportDialog
            actions={actions.productImport}
            onClose={() => setIsImportOpen(false)}
            onImported={async (result) => {
              setIsImportOpen(false);
              setMessage(
                `Đã tạo ${result.created}, cập nhật ${result.updated}, bỏ qua ${result.skipped} sản phẩm.`,
              );
              await loadProducts();
            }}
          />
        )}
        {productPendingDeactivation && (
          <div className="modal-backdrop" role="presentation">
            <section
              className="confirm-dialog"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="deactivate-title"
              aria-describedby="deactivate-description"
            >
              <span className="confirm-icon" aria-hidden="true">
                <DeactivateIcon />
              </span>
              <h2 id="deactivate-title">Ngừng bán sản phẩm?</h2>
              <p id="deactivate-description">
                “{productPendingDeactivation.name}” sẽ không còn xuất hiện khi tạo hóa đơn mới. Dữ
                liệu cũ vẫn được giữ nguyên.
              </p>
              {deactivationError && (
                <p className="confirm-error" role="alert">
                  {deactivationError}
                </p>
              )}
              <div className="dialog-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => {
                    setDeactivationError(null);
                    setProductPendingDeactivation(null);
                  }}
                  disabled={isDeactivating}
                >
                  Hủy
                </button>
                <button
                  className="danger-button"
                  type="button"
                  onClick={() => void handleDeactivate(productPendingDeactivation)}
                  disabled={isDeactivating}
                >
                  {isDeactivating ? "Đang xử lý…" : "Xác nhận ngừng bán"}
                </button>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <path
        d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="m13.5 6.5 4 4" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function DeactivateIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="m7 7 10 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function parseUnits(
  units: readonly UnitDraft[],
): Result<readonly { id: string | null; name: string; price: number }[], string> {
  if (units.length === 0)
    return { ok: false, error: "Sản phẩm phải có ít nhất một đơn vị đang hoạt động." };
  const parsed: { id: string | null; name: string; price: number }[] = [];
  for (const unit of units) {
    const rawPrice = stripNonDigits(unit.price.trim());
    const price = Number(rawPrice);
    if (unit.name.trim() === "") return { ok: false, error: "Tên đơn vị không được để trống." };
    if (!/^\d+$/.test(rawPrice) || !Number.isSafeInteger(price))
      return { ok: false, error: "Giá bán phải là số nguyên VND không âm." };
    parsed.push({ id: unit.id, name: unit.name, price });
  }
  return { ok: true, value: parsed };
}

function optionalText(value: string): string | null {
  return value.trim() === "" ? null : value;
}

function uniqueValues(values: readonly (string | null)[]): readonly string[] {
  return [...new Set(values.filter((value): value is string => value !== null))].sort((a, b) =>
    a.localeCompare(b, "vi"),
  );
}

function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("vi")
    .trim();
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("vi") ?? "")
    .join("");
}

function toUserMessage(error: ProductCatalogError): string {
  switch (error.code) {
    case "sku_conflict":
      return `Mã sản phẩm “${error.sku}” đã được sử dụng. Vui lòng nhập mã khác.`;
    case "not_found":
      return "Không tìm thấy sản phẩm. Hãy làm mới danh mục và thử lại.";
    case "persistence":
      return "Không thể lưu dữ liệu. Hãy kiểm tra ứng dụng và thử lại.";
    case "validation":
      if (error.message.includes("Unit names must be unique"))
        return "Tên đơn vị trong cùng sản phẩm không được trùng nhau.";
      if (error.message.includes("active Unit") || error.message.includes("at least one Unit"))
        return "Sản phẩm phải có ít nhất một đơn vị đang hoạt động.";
      if (error.message.includes("price")) return "Giá bán phải là số nguyên VND không âm.";
      return "Thông tin sản phẩm chưa hợp lệ. Vui lòng kiểm tra các trường bắt buộc.";
  }
}

function formatVnd(value: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}
