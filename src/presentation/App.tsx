import { useState } from "react";
import "./App.css";
import type { Invoice } from "../domain/entities/Invoice";
import type { InvoiceScreenActions } from "./screens/CreateInvoiceScreen";
import { CreateInvoiceScreen } from "./screens/CreateInvoiceScreen";
import type { InvoiceHistoryActions } from "./screens/InvoiceHistoryScreen";
import { InvoiceHistoryScreen } from "./screens/InvoiceHistoryScreen";
import type { ProductManagementActions } from "./screens/ProductManagementScreen";
import { ProductManagementScreen } from "./screens/ProductManagementScreen";
import { QuickCalculatorPanel } from "./components/QuickCalculator";

export type AppScreen = "invoice" | "products" | "history";

export interface AppProps {
  readonly productActions: ProductManagementActions;
  readonly invoiceActions?: InvoiceScreenActions;
  readonly invoiceHistoryActions?: InvoiceHistoryActions;
  readonly initialScreen?: AppScreen;
}

export function App({
  productActions,
  invoiceActions,
  invoiceHistoryActions,
  initialScreen,
}: AppProps) {
  const [currentScreen, setCurrentScreen] = useState<AppScreen>(
    initialScreen ?? (invoiceActions ? "invoice" : "products"),
  );
  const [productQueryPrefill, setProductQueryPrefill] = useState<string | undefined>(undefined);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [editingSession, setEditingSession] = useState(0);
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);

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

  function handleSelectInvoiceForEdit(inv: Invoice) {
    setEditingInvoice(inv);
    setEditingSession((session) => session + 1);
    setCurrentScreen("invoice");
  }

  function handleToggleCalculator() {
    setIsCalculatorOpen((current) => !current);
  }

  const effectiveHistoryActions: InvoiceHistoryActions | undefined =
    invoiceHistoryActions ??
    (invoiceActions?.listInvoices
      ? {
          listInvoices: invoiceActions.listInvoices,
          markInvoicePrinted: invoiceActions.markInvoicePrinted,
        }
      : undefined);

  return (
    <>
      {invoiceActions && (
        <div style={{ display: currentScreen === "invoice" ? undefined : "none" }}>
          <CreateInvoiceScreen
            key={editingSession}
            actions={invoiceActions}
            activeScreen={currentScreen}
            onNavigate={handleNavigate}
            onNavigateToProducts={handleNavigateToProducts}
            editingInvoice={editingInvoice}
            isCalculatorOpen={isCalculatorOpen}
            onToggleCalculator={handleToggleCalculator}
          />
        </div>
      )}
      {effectiveHistoryActions && currentScreen === "history" && (
        <InvoiceHistoryScreen
          actions={effectiveHistoryActions}
          activeScreen={currentScreen}
          onNavigate={handleNavigate}
          onSelectInvoiceForEdit={handleSelectInvoiceForEdit}
          isCalculatorOpen={isCalculatorOpen}
          onToggleCalculator={handleToggleCalculator}
        />
      )}
      {(!invoiceActions || currentScreen === "products") && (
        <ProductManagementScreen
          actions={productActions}
          activeScreen={currentScreen}
          onNavigate={handleNavigate}
          initialCreateQuery={productQueryPrefill}
          isCalculatorOpen={isCalculatorOpen}
          onToggleCalculator={handleToggleCalculator}
        />
      )}
      <QuickCalculatorPanel isOpen={isCalculatorOpen} onClose={() => setIsCalculatorOpen(false)} />
    </>
  );
}
