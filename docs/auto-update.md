# Cập nhật Smart Invoice trên Windows

## Phạm vi

Tính năng cập nhật được yêu cầu cho Windows x64, dùng Tauri Updater v2 và
GitHub Releases của repository Public `baonguyen1776/smart_invoice`.
Identifier `com.smartinvoice.desktop`, file `smart-invoice.db`, thư mục dữ liệu
và các migration đã có được giữ nguyên. Updater không mang database mẫu vào
máy người dùng và không xóa dữ liệu khi nâng cấp.

App kiểm tra bản mới trước khi mount màn hình danh mục/hóa đơn. Người dùng
chọn **Cập nhật** hoặc **Để sau**. Có thể bỏ qua ngay khi đang kiểm tra;
kết quả đến muộn không được đóng app khi người dùng đã bắt đầu làm việc.
Mất mạng, chưa có Release hoặc lỗi kiểm tra không cản trở mở app.
Khi đang tải/cài, màn hình nhập liệu chưa được mở. Tải hoặc xác minh chữ ký
thất bại cho phép thử lại hoặc tiếp tục dùng bản hiện tại.

Kiểm tra tự động chỉ bật trong bản build production chạy trong Tauri trên
Windows. `npm run dev`, `tauri dev` và bản macOS không cài cập nhật Windows.
Startup check có timeout 5 giây. Mỗi phiên chạy chỉ kiểm tra một lần.

## Dependency

- `@tauri-apps/plugin-updater`: API TypeScript để kiểm tra/tải/cài và nhận tiến độ.
- `tauri-plugin-updater`: xác minh chữ ký và cài bộ cập nhật native.
- `serde_json`: khai báo trực tiếp crate đã có trong dependency tree để macro
  Tauri đọc cấu hình plugin; được người dùng chấp thuận trong phiên triển khai.

Các API và dependency trước đây chưa có cơ chế cập nhật có xác minh chữ ký.
Plugin Updater 2.14 yêu cầu API/Tauri 2.12, nên lockfile cập nhật các thành phần
Tauri v2 liên quan. Không chuyển sang Tauri v3. Tắt feature ZIP legacy của
plugin vì Windows v2 dùng trực tiếp NSIS `.exe`; TLS và system proxy vẫn bật.

## Khóa ký: thiết lập một lần trên máy chủ dự án

Khóa đã được tạo tại `.update-signing/smart-invoice.key` trong bản làm việc
đầu tiên. Thư mục này được `.gitignore` bỏ qua; khóa bí mật có quyền file 600.
Khóa công khai tương ứng đã nằm trong `src-tauri/tauri.conf.json`.

**Sao lưu khóa bí mật ở nơi an toàn trước khi phát hành.** Không commit, gửi
qua chat, đưa vào artifact hoặc tạo lại khóa cho mỗi version. Người clone
repository sẽ không nhận khóa bí mật. Nếu dùng khóa khác, phải cập nhật khóa
công khai tương ứng trước khi cài bản đầu tiên có Updater lên máy người dùng.

Khóa mới tạo không đặt mật khẩu; quyền file bảo vệ bản local. Nếu dùng CLI
đã đăng nhập đúng tài khoản và có quyền với repository, chạy:

```bash
gh auth login -h github.com
gh secret set TAURI_SIGNING_PRIVATE_KEY --repo baonguyen1776/smart_invoice < .update-signing/smart-invoice.key
```

Không cần tạo `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` cho khóa này. Nếu dùng khóa
có mật khẩu, lưu mật khẩu vào secret cùng tên. `GITHUB_TOKEN` được workflow
cấp tự động; không đưa token cá nhân vào app hoặc source code.

Cũng có thể thêm secret bằng **Settings → Secrets and variables → Actions**.
Giá trị secret là toàn bộ nội dung khóa bí mật, không phải đường dẫn file.

## Phát hành 0.1.2 lần đầu

Phiên bản `0.1.2` là bản Release đầu tiên có Updater; bản `0.1.0` đã cài cần được nâng
cấp thủ công một lần bằng bộ cài mới. Bản installer `0.1.1` cũng có Updater nhưng
workflow Release của tag đó thất bại do script chưa xử lý CRLF; giữ nguyên tag
và dùng `0.1.2` để phát hành bản sửa. Bước build/publish Windows thực tế phải
thực hiện trên GitHub sau khi cấu hình secret; chưa thể coi là đã kiểm tra
cập nhật thực tế chỉ từ các test local trên macOS.

1. Chạy các lệnh kiểm tra ở cuối tài liệu, review diff rồi commit code trên
   `feature/auto-update`. Đảm bảo không có khóa bí mật trong staged files.
2. Đẩy nhánh lên GitHub và đưa thay đổi vào nhánh phát hành qua PR/self-review.
3. Tại commit cần phát hành, tạo và đẩy tag:

   ```bash
   git tag v0.1.2
   git push origin v0.1.2
   ```

4. Mở **Actions → Windows release**, chờ kiểm tra/build thành công.
5. Mở **Releases**, review bản nháp. Phải có `*-setup.exe`, chữ ký `.sig`
   và `latest.json` chứa target `windows-x86_64` và version `0.1.2`.
6. Tải bộ cài từ draft, thử cài đè bản `0.1.0` trên Windows có dữ liệu mẫu.
7. Chọn **Publish release**, không đánh dấu pre-release. Xác nhận URL
   `https://github.com/baonguyen1776/smart_invoice/releases/latest/download/latest.json`
   truy cập được mà không cần đăng nhập.

Workflow `Windows installer` cũ vẫn lưu `.exe` trong Artifacts, nhưng cũng cần
secret ký vì cấu hình đã bật tạo updater artifacts. Workflow `Windows release`
mới chạy theo tag `v*`, tạo draft và không tự công bố bản cập nhật.

## Những lần sau: ví dụ 0.1.3

1. Thực hiện thay đổi code theo story và thêm migration mới nếu schema đổi;
   không chỉnh migration đã phát hành.
2. Đồng bộ version trong `package.json`, `package-lock.json`,
   `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json`.
   Có thể dùng `npm version 0.1.3 --no-git-tag-version` để cập nhật hai file npm,
   sửa version package Rust/config rồi chạy `cargo check` trong `src-tauri`
   để cập nhật Cargo.lock.
3. Chạy kiểm tra, commit, tạo tag `v0.1.3` rồi đẩy tag.
4. Review và publish draft Release như lần đầu.
5. Máy Windows đã cài `0.1.2` sẽ nhận thông báo ở lần mở app tiếp theo khi có
   mạng. Người dùng bấm **Cập nhật**, Windows đóng app và chạy bộ cài; nếu app
   chưa tự mở lại sau khi cài thì mở từ Start Menu.

## Kiểm tra dữ liệu trên Windows trước khi phát hành

- Sao lưu database thử nghiệm bằng SQLite backup hoặc copy khi app đã đóng
  hoàn toàn (không copy riêng file `.db` khi kết nối WAL vẫn đang ghi).
- Từ `0.1.0`, tạo sản phẩm/đơn vị, hóa đơn nháp và hóa đơn hoàn tất; ghi lại ID,
  nội dung và số lượng bản ghi. Cài đè `0.1.2`, kiểm tra dữ liệu vẫn đúng.
- Từ `0.1.1`, publish `0.1.2` và cập nhật ngay trong app; đối chiếu lại dữ liệu,
  lịch sử hóa đơn và in thử.
- Thử **Để sau**, bỏ qua khi đang kiểm tra, mất mạng và lỗi tải. App vẫn dùng
  được và không tự cài khi người dùng đã vào màn hình nhập liệu.
- Một thay đổi schema cần kiểm tra cả DB mới và DB nâng cấp từ bản đã phát hành.
  Không giả định downgrade phần mềm sẽ hoàn tác được schema.

## Verification

```bash
npm run typecheck
npm run lint
npm run test
npm run build
node scripts/verify-release.mjs
node --test scripts/verify-release-check.mjs
```

Trong `src-tauri`:

```bash
cargo fmt --check
cargo clippy --locked
cargo test --locked
```

`scripts/verify-release.mjs` kiểm tra version giữa manifests/lockfiles/config,
identifier dữ liệu và cấu hình chữ ký. Trên CI, nó còn đối chiếu tag với version.
Các test Application/Infrastructure/UI mô phỏng cập nhật; chúng không thay thế
việc cài bộ cập nhật có chữ ký trên máy Windows.

## Kết quả kiểm tra local của bản triển khai 0.1.1

- `npm ci` — passed.
- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm run test` — passed: 394 test trong 40 file, gồm 24 test mới cho Updater.
- `npm run build` — passed.
- `cargo check --manifest-path src-tauri/Cargo.toml --offline` — passed.
- `cargo fmt --check` (trong `src-tauri`) — passed.
- `cargo clippy --locked` (trong `src-tauri`) — passed.
- `cargo test --locked` (trong `src-tauri`) — passed: 44 test, 2 benchmark ignored.
- `node scripts/verify-release.mjs` — passed. Kiểm tra thêm xác nhận tag
  `v0.1.1` được chấp nhận và tag sai `v9.9.9` bị từ chối.
- Prettier check cho các file frontend/config/docs/workflow thay đổi — passed.
- Parse YAML cả hai workflow bằng Ruby YAML — passed.
- `git diff --check` — passed.
- Windows installer `0.1.1` đã build thành công tại
  [GitHub Actions run 38900230825](https://github.com/baonguyen1776/smart_invoice/actions/runs/38900230825).
- Khóa ký đã được lưu vào GitHub Actions Secret sau khi người dùng cho phép.
  Kiểm tra ký/verify local xác nhận public key trong app chấp nhận file ký đúng
  và từ chối file bị sửa.
- Workflow Release `0.1.1` thất bại ở script kiểm tra version vì CRLF của Windows;
  bản sửa `0.1.2` chuẩn hóa xuống dòng và thêm 3 test Node cho LF/CRLF/version sai.
- Chưa cài/cập nhật thực tế trên máy Windows có dữ liệu; chưa publish Release.

## Files thay đổi trong bản triển khai

- `.github/workflows/windows-installer.yml`
- `.github/workflows/windows-release.yml`
- `.gitignore`
- `README.md`
- `docs/auto-update.md`
- `package.json`
- `package-lock.json`
- `scripts/verify-release.mjs`
- `scripts/verify-release-check.mjs`
- `src-tauri/Cargo.toml`
- `src-tauri/Cargo.lock`
- `src-tauri/capabilities/default.json`
- `src-tauri/src/lib.rs`
- `src-tauri/tauri.conf.json`
- `src/main.tsx`
- `src/application/ports/AppUpdateService.ts`
- `src/application/use-cases/CheckForAppUpdate.ts`
- `src/application/use-cases/InstallAppUpdate.ts`
- `src/application/use-cases/AppUpdates.test.ts`
- `src/infrastructure/updates/TauriAppUpdateService.ts`
- `src/infrastructure/updates/TauriAppUpdateService.test.ts`
- `src/presentation/components/AppUpdateStartup.tsx`
- `src/presentation/components/AppUpdateStartup.css`
- `src/presentation/components/AppUpdateStartup.test.tsx`

Hai file local được tạo và bỏ qua bởi Git:
`.update-signing/smart-invoice.key`, `.update-signing/smart-invoice.key.pub`.
Không sửa schema, migration hoặc dữ liệu người dùng.

Tham khảo: [Tauri Updater](https://v2.tauri.app/plugin/updater/),
[tauri-action](https://github.com/tauri-apps/tauri-action).
