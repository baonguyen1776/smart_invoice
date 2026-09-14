# Chỉnh lý lỗi logic — 14/09/2026

Đã sửa 17 nhóm lỗi logic xác nhận B1–B17 của báo cáo review, bổ sung đường
tra cứu ID chính xác cho P1 và đồng bộ tài liệu quy tắc hàng trả cho M1.
Nhánh làm việc: `feature/invoice-logic-corrections`.
Mốc mã nguồn trước chỉnh lý: `a0cd656b51383949a2f33b5f48e5fc2954b05c5d`.
Các thay đổi đang ở working tree, chưa commit hoặc push.

## Hành vi đã sửa

| ID | Kết quả chỉnh lý | Bằng chứng hồi quy |
| --- | --- | --- |
| B1 | Xóa nháp kiểm tra trạng thái trên header; cascade chỉ xóa dòng của nháp tồn tại, cùng giao dịch. ID đã chốt hoặc không tồn tại trả lỗi. | Rust kiểm tra bảo toàn dòng của hóa đơn đã chốt, xóa nháp hợp lệ và ID không tồn tại. |
| B2 | Nhận kết quả lưu một dòng không xóa các dòng khác đang nhập dở. | Hook giữ nguyên dòng chưa hoàn chỉnh sau khi nhận item đã lưu. |
| B3 | Mỗi lần chọn hóa đơn từ lịch sử tạo phiên chỉnh sửa riêng; phản hồi phiên cũ không thay thế phiên hiện tại. Danh sách nháp bỏ phản hồi cũ. | UI tái hiện lưu chậm rồi chọn hóa đơn khác; App mở lại cùng hóa đơn sau khi tạo nháp mới. |
| B4 | Khách hàng được lưu độc lập khi blur qua UpdateInvoiceCustomer; dùng cùng thứ tự lưu với dòng hàng. Dữ liệu SQLite được khôi phục, địa chỉ được giữ. Cache chỉ phục vụ nhập liệu chờ lưu/phục hồi và bị xóa sau lưu thành công. | Application lưu/xóa dữ liệu khách; UI cold start, chuyển nháp, lỗi ghi rồi phục hồi, lưu dòng chậm đồng thời sửa khách. |
| B5 | Chỉ sửa khách trên hóa đơn đã chốt cũng tạo thay đổi tạm thời và yêu cầu ghi đè; Hủy thay đổi phục hồi khách và dòng hàng. | UI kiểm tra trạng thái chờ xác nhận và khôi phục khi hủy. |
| B6 | Dòng còn nhập dở, lỗi hoặc đang lưu chặn cả hoàn thành và ghi đè. | UI đặt số lượng 0 sau lần sửa hợp lệ; không thể ghi giá trị cũ xuống DB. |
| B7 | Hoàn tác gắn với hóa đơn chứa dòng đã xóa, được xóa khi đổi phiên; giữ ghi chú và chiết khấu của dòng. | UI Hoàn tác giữ note; tạo nháp khác không còn Hoàn tác của nháp trước. |
| B8 | Tổng cộng lấy toàn bộ dòng, độc lập với bộ lọc, cộng chính xác bằng số nguyên rộng. | UI hóa đơn 39.000 vẫn hiển thị 39.000 khi chỉ lọc còn dòng 29.000. |
| B9 | Xóa nháp thất bại giữ dữ liệu/cache và báo lỗi, không báo thành công. | UI mô phỏng lỗi persistence; không mất cache khách. |
| B10 | Lỗi thực thi không khóa vĩnh viễn nút hoàn thành/ghi đè; có thể thử lại mà không sửa dữ liệu. | UI thử lại hoàn thành và ghi đè sau lỗi tạm thời. |
| B11 | Theo lựa chọn của người dùng, sau hộp thoại in phải bấm “Đã in thành công” mới ghi trạng thái. Hủy/lỗi mở hộp thoại không ghi. Lỗi lưu trạng thái cho phép thử lại mà không in thêm bản. | Receipt kiểm tra hủy, lỗi mở hộp thoại, retry; cả History và Editor kiểm tra gọi mark sau xác nhận. |
| B12 | Phiếu hiển thị chiết khấu âm và tiền hàng trả bằng dấu ngoặc. | Receipt kiểm tra -1.000 thành (1.000) ở dòng và tổng chiết khấu. |
| B13 | Bản ghi không rehydrate được làm list trả lỗi rõ ràng; History có thông báo và thử lại, không giả thành danh sách rỗng. | Repository kiểm tra record hỏng; UI kiểm tra thông báo lỗi thay vì trạng thái không có hóa đơn. |
| B14 | Kích hoạt lại sản phẩm nạp lại alias của sản phẩm vào index, kể cả sau cold start. | Application + Fuse kiểm tra tìm được alias đã lưu sau kích hoạt lại. |
| B15 | Khởi động có màn hình tải/thất bại/thử lại; chỉ mở ứng dụng khi toàn bộ index sẵn sàng. Các lần tải đồng thời dùng chung request. | Startup qua lỗi list tạm thời, thử lại và tìm được sản phẩm. |
| B16 | Autocomplete hiển thị SKU, brand, category và đơn vị để phân biệt tên trùng. | UI hai sản phẩm cùng tên/đơn vị khác brand hiển thị khác nhau. |
| B17 | Rust cộng bằng i128 và kiểm tra tổng cuối, không phụ thuộc thứ tự dòng. Tổng trang in dùng BigInt nên không làm crash hóa đơn hợp lệ có dòng bù trừ. | Rust kiểm tra [M,M,-M] và [M,-M,M]; Receipt kiểm tra 29 dòng có tổng trang vượt MAX_SAFE_INTEGER. |
| P1 | Grid dùng tra ID chính xác; ID thiếu/ngừng hoạt động không kích hoạt Fuse fuzzy search. | Test ID không tồn tại trùng tên một sản phẩm vẫn trả rỗng khi tra chính xác; benchmark 100 lần tra ID thiếu. |
| M1 | AGENTS, Coding Conventions và Architecture thống nhất với UC-01/migration đã phê duyệt: số lượng khác 0, âm cho hàng trả; giá không âm, tiền hóa đơn có dấu. | Đối chiếu quy tắc với UC-01 A3 và migration 0005; không thay migration cũ. |

Application còn tuần tự hóa toàn bộ thao tác đọc/sửa/ghi nháp theo hóa đơn và
repository instance. Test chạy đồng thời sửa số lượng, khách hàng và giá từ
nhiều use-case instance, xác nhận cả ba thay đổi được giữ. Hàng đợi giải phóng
entry sau khi thao tác cuối hoàn tất; các hóa đơn khác không dùng chung khóa.

## Kiểm chứng

Các lệnh frontend chạy tại thư mục repository; lệnh Cargo chạy tại `src-tauri`.

| Lệnh | Kết quả cuối |
| --- | --- |
| `npm run typecheck` | Qua |
| `npm run lint` | Qua, không warning |
| `npm test -- --reporter=dot` | 265 tests qua, 21 files; tăng 30 tests so với trước chỉnh lý |
| `npm run build` | Qua; JS 327,05 kB, gzip 97,34 kB |
| `npm run format:check` | Qua |
| `cargo fmt --check` | Qua |
| `cargo clippy --offline --all-targets` | Qua |
| `cargo test --offline` | 38 qua, 2 benchmark được đánh dấu ignored; tăng 3 tests |
| `npm run benchmark:search` | Qua với 10.000 sản phẩm / 50.000 đơn vị |
| `git diff --check` | Qua |

Benchmark tìm kiếm: index-load P95 58,796 ms; autocomplete P95 51,600 ms.
100 lần tra ID thiếu theo chế độ chính xác: tổng 0,052 ms. Trong review trước,
100 lần tra cùng ID qua đường fuzzy mất khoảng 28.288 ms trên bộ dữ liệu này.
Đây là phép đo riêng index trong CLI, không phải thời gian toàn màn hình.

## Giới hạn và việc còn lại

- Không thay schema, migration đã áp dụng, dependency hoặc stack công nghệ.
- B1 ngăn mất dòng trong các thao tác mới; không tự khôi phục dòng đã mất trước
  khi sửa. Khi gặp record hỏng, list hiện trả lỗi cho toàn bộ kết quả thay vì
  âm thầm bỏ record đó. Chưa có công cụ sửa dữ liệu/hiển thị kết quả một phần.
- R1: thứ tự lưu nháp trong cùng tiến trình đã được bảo vệ. Chưa có cơ chế phát
  hiện xung đột giữa nhiều tiến trình/repository instance, hoặc phiên ghi đè
  hóa đơn đã chốt từ nhiều nơi. Chưa triển khai OCC/single-instance policy.
- R2: validation DTO sản phẩm phía native vẫn cần đợt sửa riêng.
- R3: chưa kiểm chứng phân trang/cắt trang bằng PDF hoặc máy in thực tế.
  Xác nhận “đã in” là xác nhận của người dùng, chưa phải kết quả PrinterService.
- P2: lịch sử vẫn nạp toàn bộ hóa đơn và dùng truy vấn item theo từng hóa đơn;
  phân trang/lazy loading và N+1 chưa được xử lý trong đợt sửa logic này.
- S1: CSP chưa được siết trong đợt này.
- Chưa đóng gói hoặc phát hành ứng dụng; chưa commit, push hay tạo PR.

## Danh sách tệp thay đổi

- Sửa: [AGENTS.md](../../AGENTS.md)
- Sửa: [CODING_CONVENTIONS.md](../../CODING_CONVENTIONS.md)
- Sửa: [docs/architecture.md](../../docs/architecture.md)
- Tạo mới: [docs/testing/logic-corrections-2026-09-14.md](../../docs/testing/logic-corrections-2026-09-14.md)
- Sửa: [docs/use-cases/UC-01-invoice.md](../../docs/use-cases/UC-01-invoice.md)
- Sửa: [src-tauri/src/database.rs](../../src-tauri/src/database.rs)
- Sửa: [src-tauri/src/database_regression_tests.rs](../../src-tauri/src/database_regression_tests.rs)
- Sửa: [src/application/ports/ProductSearchIndex.ts](../../src/application/ports/ProductSearchIndex.ts)
- Sửa: [src/application/use-cases/ApplyInvoiceItemChange.ts](../../src/application/use-cases/ApplyInvoiceItemChange.ts)
- Sửa: [src/application/use-cases/InvoiceUseCaseSupport.ts](../../src/application/use-cases/InvoiceUseCaseSupport.ts)
- Sửa: [src/application/use-cases/LoadProductSearchIndex.ts](../../src/application/use-cases/LoadProductSearchIndex.ts)
- Sửa: [src/application/use-cases/MarkInvoicePrinted.ts](../../src/application/use-cases/MarkInvoicePrinted.ts)
- Sửa: [src/application/use-cases/ReactivateProduct.ts](../../src/application/use-cases/ReactivateProduct.ts)
- Sửa: [src/application/use-cases/SearchProducts.ts](../../src/application/use-cases/SearchProducts.ts)
- Tạo mới: [src/application/use-cases/UpdateInvoiceCustomer.test.ts](../../src/application/use-cases/UpdateInvoiceCustomer.test.ts)
- Tạo mới: [src/application/use-cases/UpdateInvoiceCustomer.ts](../../src/application/use-cases/UpdateInvoiceCustomer.ts)
- Sửa: [src/domain/rules/CalculateInvoiceAmounts.ts](../../src/domain/rules/CalculateInvoiceAmounts.ts)
- Sửa: [src/infrastructure/repositories/SQLiteInvoiceRepository.test.ts](../../src/infrastructure/repositories/SQLiteInvoiceRepository.test.ts)
- Sửa: [src/infrastructure/repositories/SQLiteInvoiceRepository.ts](../../src/infrastructure/repositories/SQLiteInvoiceRepository.ts)
- Sửa: [src/infrastructure/search/FuseProductSearchIndex.ts](../../src/infrastructure/search/FuseProductSearchIndex.ts)
- Sửa: [src/infrastructure/search/ProductSearchBenchmark.ts](../../src/infrastructure/search/ProductSearchBenchmark.ts)
- Sửa: [src/main.tsx](../../src/main.tsx)
- Sửa: [src/presentation/App.test.tsx](../../src/presentation/App.test.tsx)
- Sửa: [src/presentation/App.tsx](../../src/presentation/App.tsx)
- Sửa: [src/presentation/components/InvoiceLineItems.tsx](../../src/presentation/components/InvoiceLineItems.tsx)
- Sửa: [src/presentation/components/InvoiceProductCell.tsx](../../src/presentation/components/InvoiceProductCell.tsx)
- Sửa: [src/presentation/components/InvoiceReceiptPreviewModal.css](../../src/presentation/components/InvoiceReceiptPreviewModal.css)
- Sửa: [src/presentation/components/InvoiceReceiptPreviewModal.test.tsx](../../src/presentation/components/InvoiceReceiptPreviewModal.test.tsx)
- Sửa: [src/presentation/components/InvoiceReceiptPreviewModal.tsx](../../src/presentation/components/InvoiceReceiptPreviewModal.tsx)
- Tạo mới: [src/presentation/components/ProductSearchStartup.tsx](../../src/presentation/components/ProductSearchStartup.tsx)
- Tạo mới: [src/presentation/formatters/FormatInvoiceAmount.ts](../../src/presentation/formatters/FormatInvoiceAmount.ts)
- Tạo mới: [src/presentation/hooks/useInvoiceGrid.test.tsx](../../src/presentation/hooks/useInvoiceGrid.test.tsx)
- Sửa: [src/presentation/hooks/useInvoiceGrid.ts](../../src/presentation/hooks/useInvoiceGrid.ts)
- Sửa: [src/presentation/screens/CreateInvoiceScreen.test.tsx](../../src/presentation/screens/CreateInvoiceScreen.test.tsx)
- Sửa: [src/presentation/screens/CreateInvoiceScreen.tsx](../../src/presentation/screens/CreateInvoiceScreen.tsx)
- Sửa: [src/presentation/screens/InvoiceHistoryScreen.test.tsx](../../src/presentation/screens/InvoiceHistoryScreen.test.tsx)
- Sửa: [src/presentation/screens/InvoiceHistoryScreen.tsx](../../src/presentation/screens/InvoiceHistoryScreen.tsx)
- Tạo mới: [src/test/InvoiceLogicRegressions.test.tsx](../../src/test/InvoiceLogicRegressions.test.tsx)
