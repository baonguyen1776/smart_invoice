import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AppUpdateInfo, AppUpdateProgress } from "../../application/ports/AppUpdateService";
import type { CheckForAppUpdate } from "../../application/use-cases/CheckForAppUpdate";
import type { InstallAppUpdate } from "../../application/use-cases/InstallAppUpdate";
import "./AppUpdateStartup.css";

type UpdateState =
  | { readonly kind: "checking" }
  | { readonly kind: "ready" }
  | { readonly kind: "available"; readonly update: AppUpdateInfo; readonly failed?: boolean }
  | { readonly kind: "installing"; readonly progress?: AppUpdateProgress }
  | { readonly kind: "installed" };

export function AppUpdateStartup({
  checker,
  installer,
  children,
}: {
  readonly checker: Pick<CheckForAppUpdate, "execute" | "dismiss">;
  readonly installer: Pick<InstallAppUpdate, "execute">;
  readonly children: ReactNode;
}) {
  const [state, setState] = useState<UpdateState>({ kind: "checking" });
  const continued = useRef(false);
  const installing = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void checker.execute().then((result) => {
      if (cancelled || continued.current) return;
      setState(
        result.ok && result.value ? { kind: "available", update: result.value } : { kind: "ready" },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [checker]);

  function handleContinue() {
    if (installing.current) return;
    continued.current = true;
    void checker.dismiss();
    setState({ kind: "ready" });
  }

  async function handleInstall() {
    if (state.kind !== "available" || installing.current) return;
    const update = state.update;
    installing.current = true;
    setState({ kind: "installing" });
    const result = await installer.execute((progress) => {
      setState({ kind: "installing", progress });
    });
    installing.current = false;
    setState(result.ok ? { kind: "installed" } : { kind: "available", update, failed: true });
  }

  if (state.kind === "ready") return children;

  return (
    <main className="app-update-startup">
      <section className="app-update-card" aria-labelledby="app-update-title">
        <p className="app-update-brand">Smart Invoice</p>
        <h1 id="app-update-title">
          {state.kind === "checking"
            ? "Đang kiểm tra cập nhật…"
            : state.kind === "available"
              ? `Đã có phiên bản ${state.update.version}`
              : state.kind === "installing"
                ? "Đang cập nhật ứng dụng…"
                : "Đã cài bản cập nhật"}
        </h1>

        {state.kind === "checking" && (
          <>
            <p>Bạn có thể mở ứng dụng ngay để tiếp tục làm việc.</p>
            <button type="button" onClick={handleContinue}>
              Mở ứng dụng
            </button>
          </>
        )}

        {state.kind === "available" && (
          <>
            <p>Ứng dụng sẽ đóng để cài bản mới. Dữ liệu được lưu riêng trên máy của bạn.</p>
            {state.update.notes && <p className="app-update-notes">{state.update.notes}</p>}
            {state.failed && (
              <p role="alert">Chưa cập nhật được. Bạn có thể thử lại hoặc để lần sau.</p>
            )}
            <div className="app-update-actions">
              <button type="button" onClick={handleContinue}>
                Để sau
              </button>
              <button type="button" className="primary-button" onClick={() => void handleInstall()}>
                {state.failed ? "Thử cập nhật lại" : "Cập nhật"}
              </button>
            </div>
          </>
        )}

        {state.kind === "installing" && (
          <div role="status">
            <p>
              {state.progress?.phase === "installing"
                ? "Đang cài đặt. Ứng dụng sẽ đóng và mở lại trên Windows."
                : "Đang tải bản mới. Vui lòng giữ ứng dụng mở."}
            </p>
            <progress
              aria-label="Tiến độ cập nhật"
              max={state.progress?.totalBytes || undefined}
              value={state.progress?.totalBytes ? state.progress.downloadedBytes : undefined}
            />
          </div>
        )}

        {state.kind === "installed" && (
          <p>Vui lòng mở lại Smart Invoice nếu ứng dụng chưa tự mở.</p>
        )}
      </section>
    </main>
  );
}
