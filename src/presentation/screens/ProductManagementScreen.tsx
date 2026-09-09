import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { ProductCatalogError } from "../../application/errors/ProductCatalogError";
import type { Result } from "../../application/shared/Result";
import type { CreateProduct, CreateProductInput } from "../../application/use-cases/CreateProduct";
import type { DeactivateProduct } from "../../application/use-cases/DeactivateProduct";
import type { ListProducts } from "../../application/use-cases/ListProducts";
import type {
  UpdateProduct,
  UpdateProductUnitInput,
} from "../../application/use-cases/UpdateProduct";
import type { Product } from "../../domain/entities/Product";

export interface ProductManagementActions {
  readonly createProduct: Pick<CreateProduct, "execute">;
  readonly updateProduct: Pick<UpdateProduct, "execute">;
  readonly deactivateProduct: Pick<DeactivateProduct, "execute">;
  readonly listProducts: Pick<ListProducts, "execute">;
}

interface ProductManagementScreenProps {
  readonly actions: ProductManagementActions;
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

export function ProductManagementScreen({ actions }: ProductManagementScreenProps) {
  const [products, setProducts] = useState<readonly Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productPendingDeactivation, setProductPendingDeactivation] = useState<Product | null>(
    null,
  );
  const [draft, setDraft] = useState<ProductDraft>(EMPTY_DRAFT);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deactivationError, setDeactivationError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
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
  const activeUnitCount = products.reduce(
    (total, product) => total + product.units.filter((unit) => unit.isActive).length,
    0,
  );

  const loadProducts = useCallback(async () => {
    setIsLoading(true);
    const result = await actions.listProducts.execute({ activity: "active" });
    setIsLoading(false);
    if (!result.ok) {
      setError(toUserMessage(result.error));
      return;
    }
    setProducts(result.value);
    setError(null);
  }, [actions.listProducts]);

  useEffect(() => {
    let isCancelled = false;

    void actions.listProducts.execute({ activity: "active" }).then((result) => {
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
  }, [actions.listProducts]);

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
        .map((unit) => ({ key: unit.id, id: unit.id, name: unit.name, price: String(unit.price) })),
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

  return (
    <div className="app-frame">
      <aside className="sidebar" aria-label="Điều hướng chính">
        <div className="brand-mark">
          <span>SI</span>
          <strong>Smart Invoice</strong>
        </div>
        <nav>
          <p>QUẢN LÝ</p>
          <a className="active" href="#catalog-title" aria-current="page">
            <span aria-hidden="true">▦</span>Sản phẩm
          </a>
        </nav>
        <div className="offline-note">
          <span aria-hidden="true">●</span>
          <div>
            <strong>Dữ liệu cục bộ</strong>
            <small>Sẵn sàng ngoại tuyến</small>
          </div>
        </div>
      </aside>

      <main className="workspace">
        <header className="page-header">
          <div>
            <p className="breadcrumb">Danh mục / Sản phẩm</p>
            <h1>Quản lý sản phẩm</h1>
            <p className="subtitle">Tra cứu và cập nhật bảng giá bán tại một nơi.</p>
          </div>
          <button className="primary-button" type="button" onClick={openCreateForm}>
            <span aria-hidden="true">＋</span> Thêm sản phẩm
          </button>
        </header>

        {message && (
          <p className="notice success" role="status">
            {message}
          </p>
        )}
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}

        <section className="summary-strip" aria-label="Tổng quan danh mục">
          <div>
            <span className="summary-icon box" aria-hidden="true">
              □
            </span>
            <p>
              <small>SẢN PHẨM ĐANG BÁN</small>
              <strong>{products.length}</strong>
            </p>
          </div>
          <div>
            <span className="summary-icon unit" aria-hidden="true">
              ↔
            </span>
            <p>
              <small>ĐƠN VỊ TÍNH</small>
              <strong>{activeUnitCount}</strong>
            </p>
          </div>
          <div>
            <span className="summary-icon category" aria-hidden="true">
              ◇
            </span>
            <p>
              <small>NHÓM SẢN PHẨM</small>
              <strong>{categories.length}</strong>
            </p>
          </div>
        </section>

        <section className="catalog-panel" aria-labelledby="catalog-title">
          <div className="panel-heading">
            <div>
              <h2 id="catalog-title">Danh sách sản phẩm</h2>
              <p>
                {visibleProducts.length} trong {products.length} sản phẩm
              </p>
            </div>
            <button
              className="refresh-button"
              type="button"
              onClick={() => void loadProducts()}
              aria-label="Làm mới danh sách"
            >
              ↻ <span>Làm mới</span>
            </button>
          </div>
          <div className="catalog-toolbar">
            <label className="search-box">
              <span className="sr-only">Tìm sản phẩm</span>
              <span aria-hidden="true">⌕</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Tìm theo tên, mã, thương hiệu…"
              />
            </label>
            <label>
              <span className="sr-only">Lọc theo thương hiệu</span>
              <select value={brandFilter} onChange={(event) => setBrandFilter(event.target.value)}>
                <option value="">Tất cả thương hiệu</option>
                {brands.map((brand) => (
                  <option key={brand}>{brand}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">Lọc theo nhóm sản phẩm</span>
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
              >
                <option value="">Tất cả nhóm</option>
                {categories.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </label>
          </div>

          {isLoading ? (
            <p className="empty-state" role="status">
              Đang tải danh mục…
            </p>
          ) : products.length === 0 ? (
            <div className="empty-state">
              <strong>Chưa có sản phẩm</strong>
              <span>Thêm sản phẩm đầu tiên để bắt đầu tạo hóa đơn.</span>
              <button className="primary-button" type="button" onClick={openCreateForm}>
                Thêm sản phẩm
              </button>
            </div>
          ) : visibleProducts.length === 0 ? (
            <div className="empty-state">
              <strong>Không tìm thấy sản phẩm</strong>
              <span>Thử từ khóa khác hoặc bỏ bộ lọc.</span>
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
                        <span className="status-badge">
                          <i aria-hidden="true" />
                          Đang bán
                        </span>
                      </td>
                      <td>
                        <div className="row-actions">
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
                    <small className="field-help">Tên hiển thị khi tìm kiếm và lập hóa đơn.</small>
                  </label>
                  <label>
                    <span className="field-label">
                      Mã sản phẩm <span className="optional-label">(không bắt buộc)</span>
                    </span>
                    <input
                      value={draft.sku}
                      onChange={(event) => setDraft({ ...draft, sku: event.target.value })}
                      placeholder="Ví dụ: CF-001"
                      aria-describedby="product-code-help"
                    />
                    <small id="product-code-help" className="field-help">
                      Mã riêng giúp tìm và phân biệt sản phẩm nhanh hơn (còn gọi là SKU).
                    </small>
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
                    <small className="field-help">Có thể chọn nhanh một thương hiệu đã dùng.</small>
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
                    <small className="field-help">Có thể chọn nhanh một nhóm đã dùng.</small>
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
                      <p>Giá là số nguyên, đơn vị VND.</p>
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
                        Giá bán
                        <input
                          required
                          inputMode="numeric"
                          value={unit.price}
                          onChange={(event) => updateUnit(unit.key, "price", event.target.value)}
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
    const price = Number(unit.price);
    if (unit.name.trim() === "") return { ok: false, error: "Tên đơn vị không được để trống." };
    if (!/^\d+$/.test(unit.price.trim()) || !Number.isSafeInteger(price))
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
