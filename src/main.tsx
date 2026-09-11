import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ApplyInvoiceItemChange } from "./application/use-cases/ApplyInvoiceItemChange";
import { CreateInvoiceDraft } from "./application/use-cases/CreateInvoiceDraft";
import { DeleteInvoiceDraft } from "./application/use-cases/DeleteInvoiceDraft";
import { ListInvoices } from "./application/use-cases/ListInvoices";
import { RestoreInvoiceDraft } from "./application/use-cases/RestoreInvoiceDraft";
import { CreateProduct } from "./application/use-cases/CreateProduct";
import { DeactivateProduct } from "./application/use-cases/DeactivateProduct";
import { ListProducts } from "./application/use-cases/ListProducts";
import { LoadProductSearchIndex } from "./application/use-cases/LoadProductSearchIndex";
import { SearchProducts } from "./application/use-cases/SearchProducts";
import { UpdateProduct } from "./application/use-cases/UpdateProduct";
import { SQLiteInvoiceRepository } from "./infrastructure/repositories/SQLiteInvoiceRepository";
import { SQLiteProductAliasRepository } from "./infrastructure/repositories/SQLiteProductAliasRepository";
import { SQLiteProductRepository } from "./infrastructure/repositories/SQLiteProductRepository";
import { FuseProductSearchIndex } from "./infrastructure/search/FuseProductSearchIndex";
import { SystemClock } from "./infrastructure/system/SystemClock";
import { WebCryptoIdGenerator } from "./infrastructure/system/WebCryptoIdGenerator";
import { App } from "./presentation/App";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element was not found.");
}

const repository = new SQLiteProductRepository();
const aliasRepository = new SQLiteProductAliasRepository();
const invoiceRepository = new SQLiteInvoiceRepository();
const searchIndex = new FuseProductSearchIndex();
const clock = new SystemClock();
const idGenerator = new WebCryptoIdGenerator();

const searchLoad = await new LoadProductSearchIndex(
  repository,
  aliasRepository,
  searchIndex,
).execute();
if (!searchLoad.ok) {
  console.error("Product search index failed to initialize.");
}

const productActions = {
  createProduct: new CreateProduct(repository, idGenerator, clock, searchIndex),
  updateProduct: new UpdateProduct(repository, idGenerator, clock, searchIndex),
  deactivateProduct: new DeactivateProduct(repository, clock, searchIndex),
  listProducts: new ListProducts(repository),
};

const invoiceActions = {
  createInvoiceDraft: new CreateInvoiceDraft(invoiceRepository, idGenerator, clock),
  restoreInvoiceDraft: new RestoreInvoiceDraft(invoiceRepository, idGenerator, clock),
  applyInvoiceItemChange: new ApplyInvoiceItemChange(invoiceRepository, idGenerator, clock),
  searchProducts: new SearchProducts(searchIndex),
  listInvoices: new ListInvoices(invoiceRepository),
  deleteInvoiceDraft: new DeleteInvoiceDraft(invoiceRepository),
};

createRoot(rootElement).render(
  <StrictMode>
    <App productActions={productActions} invoiceActions={invoiceActions} />
  </StrictMode>,
);
