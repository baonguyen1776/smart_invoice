import { useCallback, useEffect, useState, type FormEvent } from "react";
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
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [draft, setDraft] = useState<ProductDraft>(EMPTY_DRAFT);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    if (!window.confirm(`Ngừng sử dụng “${product.name}”? Sản phẩm vẫn được giữ trong lịch sử.`))
      return;
    setError(null);
    setMessage(null);
    const result = await actions.deactivateProduct.execute({ productId: product.id });
    if (!result.ok) {
      setError(toUserMessage(result.error));
      return;
    }
    setMessage("Đã ngừng sử dụng sản phẩm.");
    await loadProducts();
  }

  return (
    <main className="catalog-shell">
      <header className="catalog-header">
        <div>
          <p className="eyebrow">Smart Invoice</p>
          <h1>Quản lý sản phẩm</h1>
          <p className="subtitle">Danh mục sản phẩm và đơn giá bán hiện hành</p>
        </div>
        <button className="primary-button" type="button" onClick={openCreateForm}>
          + Thêm sản phẩm
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
      <section className="catalog-card" aria-labelledby="catalog-title">
        <div className="section-heading">
          <div>
            <h2 id="catalog-title">Sản phẩm đang hoạt động</h2>
            <p>{products.length} sản phẩm</p>
          </div>
          <button className="text-button" type="button" onClick={() => void loadProducts()}>
            Làm mới
          </button>
        </div>
        {isLoading ? (
          <p className="empty-state" role="status">
            Đang tải danh mục…
          </p>
        ) : products.length === 0 ? (
          <div className="empty-state">
            <strong>Chưa có sản phẩm</strong>
            <span>Thêm sản phẩm đầu tiên để bắt đầu tạo hóa đơn.</span>
          </div>
        ) : (
          <div className="product-grid">
            {products.map((product) => (
              <article className="product-card" key={product.id}>
                <div className="product-card-heading">
                  <div>
                    <h3>{product.name}</h3>
                    <p>{product.sku ? `SKU ${product.sku}` : "Chưa có SKU"}</p>
                  </div>
                  <span className="status-badge">Đang bán</span>
                </div>
                <p className="product-meta">
                  {[product.brand, product.category].filter(Boolean).join(" · ") ||
                    "Chưa có thương hiệu / nhóm"}
                </p>
                <ul className="unit-list" aria-label={`Đơn vị của ${product.name}`}>
                  {product.units
                    .filter((unit) => unit.isActive)
                    .map((unit) => (
                      <li key={unit.id}>
                        <span>{unit.name}</span>
                        <strong>{formatVnd(unit.price)}</strong>
                      </li>
                    ))}
                </ul>
                <div className="card-actions">
                  <button type="button" onClick={() => openEditForm(product)}>
                    Chỉnh sửa
                  </button>
                  <button
                    className="danger-button"
                    type="button"
                    onClick={() => void handleDeactivate(product)}
                  >
                    Ngừng sử dụng
                  </button>
                </div>
              </article>
            ))}
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
                <label className="full-field">
                  Tên sản phẩm <span aria-hidden="true">*</span>
                  <input
                    required
                    value={draft.name}
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  />
                </label>
                <label>
                  SKU
                  <input
                    value={draft.sku}
                    onChange={(event) => setDraft({ ...draft, sku: event.target.value })}
                  />
                </label>
                <label>
                  Thương hiệu
                  <input
                    value={draft.brand}
                    onChange={(event) => setDraft({ ...draft, brand: event.target.value })}
                  />
                </label>
                <label className="full-field">
                  Nhóm sản phẩm
                  <input
                    value={draft.category}
                    onChange={(event) => setDraft({ ...draft, category: event.target.value })}
                  />
                </label>
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
    </main>
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

function toUserMessage(error: ProductCatalogError): string {
  switch (error.code) {
    case "sku_conflict":
      return `SKU “${error.sku}” đã được sử dụng. Vui lòng nhập SKU khác.`;
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
