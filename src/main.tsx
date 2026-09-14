import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ApplyInvoiceItemChange } from "./application/use-cases/ApplyInvoiceItemChange";
import { CompleteInvoice } from "./application/use-cases/CompleteInvoice";
import { CreateInvoiceDraft } from "./application/use-cases/CreateInvoiceDraft";
import { DeleteInvoiceDraft } from "./application/use-cases/DeleteInvoiceDraft";
import { ListInvoices } from "./application/use-cases/ListInvoices";
import { OverwriteCompletedInvoice } from "./application/use-cases/OverwriteCompletedInvoice";
import { RestoreInvoiceDraft } from "./application/use-cases/RestoreInvoiceDraft";
import { CreateProduct } from "./application/use-cases/CreateProduct";
import { DeactivateProduct } from "./application/use-cases/DeactivateProduct";
import { ListProducts } from "./application/use-cases/ListProducts";
import { LoadProductSearchIndex } from "./application/use-cases/LoadProductSearchIndex";
import { MarkInvoicePrinted } from "./application/use-cases/MarkInvoicePrinted";
import { ReactivateProduct } from "./application/use-cases/ReactivateProduct";
import { SearchProducts } from "./application/use-cases/SearchProducts";
import { UpdateProduct } from "./application/use-cases/UpdateProduct";
import { SQLiteInvoiceRepository } from "./infrastructure/repositories/SQLiteInvoiceRepository";
import { SQLiteProductAliasRepository } from "./infrastructure/repositories/SQLiteProductAliasRepository";
import { SQLiteProductRepository } from "./infrastructure/repositories/SQLiteProductRepository";
import { FuseProductSearchIndex } from "./infrastructure/search/FuseProductSearchIndex";
import { SystemClock } from "./infrastructure/system/SystemClock";
import { WebCryptoIdGenerator } from "./infrastructure/system/WebCryptoIdGenerator";
import { UpdateInvoiceCustomer } from "./application/use-cases/UpdateInvoiceCustomer";
import { ProductSearchStartup } from "./presentation/components/ProductSearchStartup";
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

const searchLoader = new LoadProductSearchIndex(repository, aliasRepository, searchIndex);

const productActions = {
  createProduct: new CreateProduct(repository, idGenerator, clock, searchIndex),
  updateProduct: new UpdateProduct(repository, idGenerator, clock, searchIndex),
  deactivateProduct: new DeactivateProduct(repository, clock, searchIndex),
  reactivateProduct: new ReactivateProduct(repository, clock, searchIndex, aliasRepository),
  listProducts: new ListProducts(repository),
};

const invoiceActions = {
  createInvoiceDraft: new CreateInvoiceDraft(invoiceRepository, idGenerator, clock),
  restoreInvoiceDraft: new RestoreInvoiceDraft(invoiceRepository, idGenerator, clock),
  updateInvoiceCustomer: new UpdateInvoiceCustomer(invoiceRepository, clock),
  applyInvoiceItemChange: new ApplyInvoiceItemChange(invoiceRepository, idGenerator, clock),
  searchProducts: new SearchProducts(searchIndex),
  listInvoices: new ListInvoices(invoiceRepository),
  deleteInvoiceDraft: new DeleteInvoiceDraft(invoiceRepository),
  completeInvoice: new CompleteInvoice(invoiceRepository, clock),
  overwriteCompletedInvoice: new OverwriteCompletedInvoice(invoiceRepository, clock),
  markInvoicePrinted: new MarkInvoicePrinted(invoiceRepository),
};

createRoot(rootElement).render(
  <StrictMode>
    <ProductSearchStartup loader={searchLoader}>
      <App productActions={productActions} invoiceActions={invoiceActions} />
    </ProductSearchStartup>
  </StrictMode>,
);
