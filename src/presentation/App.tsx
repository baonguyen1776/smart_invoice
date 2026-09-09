import "./App.css";
import type { ProductManagementActions } from "./screens/ProductManagementScreen";
import { ProductManagementScreen } from "./screens/ProductManagementScreen";

interface AppProps {
  readonly productActions: ProductManagementActions;
}

export function App({ productActions }: AppProps) {
  return <ProductManagementScreen actions={productActions} />;
}
