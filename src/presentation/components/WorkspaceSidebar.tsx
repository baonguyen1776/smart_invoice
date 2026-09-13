import { InvoiceIcon } from "./InvoiceIcon";
import "./WorkspaceSidebar.css";

interface WorkspaceSidebarProps {
  readonly activeScreen: "invoice" | "products" | "history";
  readonly onNavigate?: (screen: "invoice" | "products" | "history") => void;
}

export function WorkspaceSidebar({ activeScreen, onNavigate }: WorkspaceSidebarProps) {
  return (
    <aside className="sidebar">
      <div className="brand-mark">
        <span>
          <InvoiceIcon name="receipt" size={22} />
        </span>
        <div>
          <strong>
            Smart Invoice<span className="brand-period">.</span>
          </strong>
        </div>
      </div>
      <nav aria-label="Điều hướng chính">
        <p>KHÔNG GIAN LÀM VIỆC</p>
        {(
          [
            { screen: "invoice", label: "Tạo hóa đơn", icon: "receipt" },
            { screen: "history", label: "Lịch sử", icon: "history" },
            { screen: "products", label: "Sản phẩm", icon: "box" },
          ] as const
        ).map(({ screen, label, icon }) => (
          <button
            key={screen}
            type="button"
            className={activeScreen === screen ? "active" : ""}
            aria-current={activeScreen === screen ? "page" : undefined}
            onClick={() => onNavigate?.(screen)}
          >
            <InvoiceIcon name={icon} />
            {label}
            {activeScreen === screen && <span className="nav-active-dot" />}
          </button>
        ))}
      </nav>
      <div className="offline-note">
        <InvoiceIcon name="shield" size={18} />
        <div>
          <strong>Ngoại tuyến</strong>
        </div>
        <span className="sidebar-status-dot" />
      </div>
    </aside>
  );
}
