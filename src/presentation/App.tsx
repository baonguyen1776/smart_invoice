import { useState } from "react";
import "./App.css";
import type { InvoiceScreenActions } from "./screens/CreateInvoiceScreen";
import { CreateInvoiceScreen } from "./screens/CreateInvoiceScreen";
import type { ProductManagementActions } from "./screens/ProductManagementScreen";
import { ProductManagementScreen } from "./screens/ProductManagementScreen";

export type AppScreen = "invoice" | "products";

export interface AppProps {
  readonly productActions: ProductManagementActions;
  readonly invoiceActions?: InvoiceScreenActions;
  readonly initialScreen?: AppScreen;
}

export function App({ productActions, invoiceActions, initialScreen }: AppProps) {
  const [currentScreen, setCurrentScreen] = useState<AppScreen>(
    initialScreen ?? (invoiceActions ? "invoice" : "products"),
  );
  const [productQueryPrefill, setProductQueryPrefill] = useState<string | undefined>(undefined);

  function handleNavigate(screen: AppScreen) {
    setCurrentScreen(screen);
    if (screen !== "products") {
      setProductQueryPrefill(undefined);
    }
  }

  function handleNavigateToProducts(prefillQuery?: string) {
    setProductQueryPrefill(prefillQuery);
    setCurrentScreen("products");
  }

  return (
    <>
      {invoiceActions && (
        <div style={{ display: currentScreen === "invoice" ? undefined : "none" }}>
          <CreateInvoiceScreen
            actions={invoiceActions}
            activeScreen={currentScreen}
            onNavigate={handleNavigate}
            onNavigateToProducts={handleNavigateToProducts}
          />
        </div>
      )}
      {(!invoiceActions || currentScreen === "products") && (
        <ProductManagementScreen
          actions={productActions}
          activeScreen={currentScreen}
          onNavigate={handleNavigate}
          initialCreateQuery={productQueryPrefill}
        />
      )}
    </>
  );
}
