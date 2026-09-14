import { useEffect, useState, type ReactNode } from "react";
import type { LoadProductSearchIndex } from "../../application/use-cases/LoadProductSearchIndex";

export function ProductSearchStartup({
  loader,
  children,
}: {
  readonly loader: Pick<LoadProductSearchIndex, "execute">;
  readonly children: ReactNode;
}) {
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  useEffect(() => {
    let cancelled = false;
    void loader.execute().then(
      (result) => {
        if (!cancelled) setStatus(result.ok ? "ready" : "failed");
      },
      () => {
        if (!cancelled) setStatus("failed");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [loader, attempt]);
  if (status === "ready") return children;
  return (
    <main aria-busy={status === "loading"}>
      {status === "loading" ? (
        <p>Đang tải danh mục…</p>
      ) : (
        <>
          <p role="alert">Không thể tải danh mục hàng hóa. Vui lòng thử lại.</p>
          <button
            onClick={() => {
              setStatus("loading");
              setAttempt((value) => value + 1);
            }}
          >
            Thử tải lại danh mục
          </button>
        </>
      )}
    </main>
  );
}
