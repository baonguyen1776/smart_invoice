/* global window */
window.addEventListener("DOMContentLoaded", async () => {
  const invoke = window.__TAURI_INTERNALS__.invoke;
  const id = "11111111-1111-4111-8111-111111111111";
  const now = "2026-09-09T00:00:00.000Z";
  const checks = [];
  const check = (condition, name) => {
    if (!condition) throw new Error(name);
    checks.push(name);
  };
  try {
    if (window.SMOKE_PHASE === "write") {
      check((await invoke("get_product", { productId: id })) === null, "isolated empty profile");
      const product = {
        id, sku: "SMOKE-1", name: "Sản phẩm smoke", brand: null, category: null,
        isActive: true, createdAt: now, updatedAt: now,
        units: [{ id: "22222222-2222-4222-8222-222222222222", productId: id,
          name: "Thùng", price: 10000, isActive: true, createdAt: now, updatedAt: now }],
      };
      await invoke("create_product", { product });
      let saved = await invoke("get_product", { productId: id });
      check(saved.units[0].price === 10000, "create/get through real IPC");
      saved.units[0].price = 12000;
      await invoke("update_product", { product: saved });
      saved = await invoke("get_product", { productId: id });
      check(saved.units[0].price === 12000, "update through real IPC");
      check((await invoke("list_products", { filter: "active" })).length === 1, "active filter");
      await invoke("deactivate_product", { product: saved });
    }
    const saved = await invoke("get_product", { productId: id });
    check(saved !== null && !saved.isActive && saved.units[0].price === 12000, "persisted inactive Product and Unit");
    check((await invoke("list_products", { filter: "active" })).length === 0, "excluded from active list");
    check((await invoke("list_products", { filter: "inactive" })).length === 1, "included in inactive list");
    check((await invoke("list_products", { filter: "all" })).length === 1, "included in all list");
    await invoke("smoke_report", { success: true, report: JSON.stringify({ phase: window.SMOKE_PHASE, checks }) });
  } catch (error) {
    await invoke("smoke_report", { success: false, report: JSON.stringify({ phase: window.SMOKE_PHASE, checks, error: String(error) }) });
  }
});
