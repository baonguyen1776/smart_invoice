import { Product } from "../../domain/entities/Product";
import { ProductAlias } from "../../domain/entities/ProductAlias";
import { Unit } from "../../domain/entities/Unit";
import { FuseProductSearchIndex } from "./FuseProductSearchIndex";

const PRODUCT_COUNT = 10_000;
const UNITS_PER_PRODUCT = 5;
const LOAD_RUNS = 20;
const SEARCH_RUNS = 100;
const NOW = "2026-01-01T00:00:00.000Z";

const products: Product[] = [];
const aliases: ProductAlias[] = [];
for (let productNumber = 1; productNumber <= PRODUCT_COUNT; productNumber += 1) {
  const productId = uuid(productNumber, "1111");
  const units = Array.from({ length: UNITS_PER_PRODUCT }, (_, unitIndex) =>
    Unit.create({
      id: uuid(productNumber * UNITS_PER_PRODUCT + unitIndex, "2222"),
      productId,
      name: `Đơn vị ${unitIndex + 1}`,
      price: (unitIndex + 1) * 10_000,
      createdAt: NOW,
    }),
  );
  products.push(
    Product.create({
      id: productId,
      sku: `SKU-${productNumber.toString().padStart(5, "0")}`,
      name: `Sản phẩm Việt ${productNumber.toString().padStart(5, "0")}`,
      brand: `Nhãn ${productNumber % 100}`,
      category: `Danh mục ${productNumber % 20}`,
      units,
      createdAt: NOW,
    }),
  );
  aliases.push(
    ProductAlias.create({
      id: uuid(productNumber, "3333"),
      productId,
      alias: `Tên gọi sản phẩm ${productNumber}`,
      createdAt: NOW,
    }),
  );
}

const loadSamples: number[] = [];
let index = new FuseProductSearchIndex();
index.replace(products, aliases);
for (let run = 0; run < LOAD_RUNS; run += 1) {
  index = new FuseProductSearchIndex();
  const started = performance.now();
  index.replace(products, aliases);
  loadSamples.push(performance.now() - started);
}

const searchSamples: number[] = [];
index.search("san pham viet 05000", 10);
for (let run = 0; run < SEARCH_RUNS; run += 1) {
  const queryNumber = 1 + ((run * 97) % PRODUCT_COUNT);
  const started = performance.now();
  const results = index.search(`sản phẩm việt ${queryNumber.toString().padStart(5, "0")}`, 10);
  searchSamples.push(performance.now() - started);
  if (results.length === 0) throw new Error("Benchmark search returned no candidates.");
}

report("index_load", loadSamples, 500, 1_000);
report("autocomplete", searchSamples, 100, 300);

function uuid(value: number, group: string): string {
  return `${value.toString(16).padStart(8, "0")}-${group}-4${group.slice(1)}-8${group.slice(1)}-${group.repeat(3)}`;
}

function report(
  name: string,
  samples: readonly number[],
  p95Limit: number,
  maxLimit: number,
): void {
  const sorted = [...samples].sort((left, right) => left - right);
  const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1] ?? Number.POSITIVE_INFINITY;
  const maximum = sorted[sorted.length - 1] ?? Number.POSITIVE_INFINITY;
  const median = sorted[Math.floor(sorted.length / 2)] ?? Number.POSITIVE_INFINITY;
  const passed = p95 <= p95Limit && maximum <= maxLimit;
  console.log(
    `BENCH ${name} n=${samples.length} median_ms=${median.toFixed(3)} p95_ms=${p95.toFixed(3)} max_ms=${maximum.toFixed(3)} pass=${passed}`,
  );
  if (!passed) throw new Error(`${name} exceeded its benchmark budget.`);
}
