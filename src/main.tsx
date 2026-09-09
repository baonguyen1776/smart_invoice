import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CreateProduct } from "./application/use-cases/CreateProduct";
import { DeactivateProduct } from "./application/use-cases/DeactivateProduct";
import { ListProducts } from "./application/use-cases/ListProducts";
import { UpdateProduct } from "./application/use-cases/UpdateProduct";
import { SQLiteProductRepository } from "./infrastructure/repositories/SQLiteProductRepository";
import { SystemClock } from "./infrastructure/system/SystemClock";
import { WebCryptoIdGenerator } from "./infrastructure/system/WebCryptoIdGenerator";
import { App } from "./presentation/App";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element was not found.");
}

const repository = new SQLiteProductRepository();
const clock = new SystemClock();
const idGenerator = new WebCryptoIdGenerator();
const productActions = {
  createProduct: new CreateProduct(repository, idGenerator, clock),
  updateProduct: new UpdateProduct(repository, idGenerator, clock),
  deactivateProduct: new DeactivateProduct(repository, clock),
  listProducts: new ListProducts(repository),
};

createRoot(rootElement).render(
  <StrictMode>
    <App productActions={productActions} />
  </StrictMode>,
);
