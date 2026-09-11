const OTHER_UNIT_ID: &str = "44444444-4444-4444-8444-444444444444";

struct TestDatabaseFile(std::path::PathBuf);

impl TestDatabaseFile {
    fn new() -> Self {
        let suffix = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        Self(std::env::temp_dir().join(format!(
            "smart-invoice-review-{}-{suffix}.db",
            std::process::id()
        )))
    }
    fn options(&self) -> SqliteConnectOptions {
        connection_options()
            .filename(&self.0)
            .create_if_missing(true)
    }
}

impl Drop for TestDatabaseFile {
    fn drop(&mut self) {
        // Only this uniquely allocated test database, never an application database.
        let _ = std::fs::remove_file(&self.0);
    }
}

#[test]
fn file_database_survives_reopen_and_locked_write_times_out() {
    tauri::async_runtime::block_on(async {
        let file = TestDatabaseFile::new();
        let pool = open_database(file.options()).await.unwrap();
        save_product(&pool, product(PRODUCT_ID, UNIT_ID, None), "create", true)
            .await
            .unwrap();
        pool.close().await;
        let pool = open_database(file.options()).await.unwrap();
        assert_eq!(
            fetch_product(&pool, PRODUCT_ID)
                .await
                .unwrap()
                .unwrap()
                .units[0]
                .price,
            10_000
        );
        let blocker = open_database(file.options()).await.unwrap();
        let lock = blocker.begin_with("BEGIN IMMEDIATE").await.unwrap();
        let started = std::time::Instant::now();
        let error = save_product(
            &pool,
            product(SECOND_PRODUCT_ID, OTHER_UNIT_ID, None),
            "create",
            true,
        )
        .await
        .unwrap_err();
        let elapsed = started.elapsed();
        eprintln!("SQLite lock wait: {elapsed:?}");
        assert!(matches!(error, ProductCommandError::Persistence { .. }));
        // SQLite's busy timeout is 2000 ms; allow scheduler overhead in wall time.
        assert!(elapsed >= Duration::from_millis(1800));
        assert!(elapsed < Duration::from_millis(2500));
        lock.rollback().await.unwrap();
        assert_eq!(row_count(&pool, "products").await, 1);
        blocker.close().await;
        pool.close().await;
    });
}

#[test]
fn upgrades_initial_schema_and_rejects_incompatible_existing_values() {
    use sqlx::migrate::Migrate;
    tauri::async_runtime::block_on(async {
        for corrupt in [false, true] {
            let pool = sqlx::sqlite::SqlitePoolOptions::new()
                .max_connections(1)
                .connect_with(connection_options().in_memory(true))
                .await
                .unwrap();
            {
                let mut connection = pool.acquire().await.unwrap();
                connection.ensure_migrations_table().await.unwrap();
                connection
                    .apply(sqlx::migrate!("./migrations").iter().next().unwrap())
                    .await
                    .unwrap();
            }
            save_product(&pool, product(PRODUCT_ID, UNIT_ID, None), "create", true)
                .await
                .unwrap();
            if corrupt {
                sqlx::query("UPDATE units SET price=10.5")
                    .execute(&pool)
                    .await
                    .unwrap();
            }
            let result = sqlx::migrate!("./migrations").run(&pool).await;
            if corrupt {
                assert!(result.is_err());
                let price: f64 = sqlx::query_scalar("SELECT price FROM units")
                    .fetch_one(&pool)
                    .await
                    .unwrap();
                assert_eq!(price, 10.5);
                let applied: i64 =
                    sqlx::query_scalar("SELECT count(*) FROM _sqlx_migrations WHERE success = 1")
                        .fetch_one(&pool)
                        .await
                        .unwrap();
                assert_eq!(applied, 1);
            } else {
                result.unwrap();
                sqlx::migrate!("./migrations").run(&pool).await.unwrap();
                assert_eq!(
                    fetch_product(&pool, PRODUCT_ID)
                        .await
                        .unwrap()
                        .unwrap()
                        .units[0]
                        .price,
                    10_000
                );
            }
            pool.close().await;
        }
    });
}

async fn row_count(pool: &SqlitePool, table: &str) -> i64 {
    sqlx::query_scalar(&format!("SELECT count(*) FROM {table}"))
        .fetch_one(pool)
        .await
        .unwrap()
}

#[test]
fn rejects_foreign_owned_units_and_empty_or_inactive_aggregates() {
    tauri::async_runtime::block_on(async {
        let pool = test_pool().await;
        save_product(
            &pool,
            product(SECOND_PRODUCT_ID, OTHER_UNIT_ID, None),
            "create",
            true,
        )
        .await
        .unwrap();
        let mut invalid = product(PRODUCT_ID, UNIT_ID, None);
        invalid.units[0] = product(SECOND_PRODUCT_ID, OTHER_UNIT_ID, None)
            .units
            .remove(0);
        invalid.units[0].price = 1;
        assert!(save_product(&pool, invalid, "create", true).await.is_err());
        assert_eq!(
            fetch_product(&pool, SECOND_PRODUCT_ID)
                .await
                .unwrap()
                .unwrap()
                .units[0]
                .price,
            10_000
        );
        for empty in [false, true] {
            let mut invalid = product(PRODUCT_ID, UNIT_ID, None);
            if empty {
                invalid.units.clear();
            } else {
                invalid.units[0].is_active = false;
            }
            assert!(save_product(&pool, invalid, "create", true).await.is_err());
        }
        assert_eq!(row_count(&pool, "products").await, 1);
        assert_eq!(row_count(&pool, "units").await, 1);
    });
}

#[test]
fn swaps_unit_names_and_preserves_ids_and_created_timestamps() {
    tauri::async_runtime::block_on(async {
        let pool = test_pool().await;
        let mut original = product(PRODUCT_ID, UNIT_ID, None);
        let mut second = original.units[0].clone();
        second.id = OTHER_UNIT_ID.into();
        second.name = "Thùng".into();
        original.units.push(second);
        save_product(&pool, original.clone(), "create", true)
            .await
            .unwrap();
        original.units[0].name = "Thùng".into();
        original.units[1].name = "Can".into();
        save_product(&pool, original, "update", false)
            .await
            .unwrap();
        let result = fetch_product(&pool, PRODUCT_ID).await.unwrap().unwrap();
        assert_eq!(
            result.units.iter().find(|u| u.id == UNIT_ID).unwrap().name,
            "Thùng"
        );
        assert_eq!(
            result
                .units
                .iter()
                .find(|u| u.id == OTHER_UNIT_ID)
                .unwrap()
                .name,
            "Can"
        );
        assert!(result.units.iter().all(|u| u.created_at == NOW));
    });
}

#[test]
fn unicode_uniqueness_is_enforced_by_database_and_command() {
    tauri::async_runtime::block_on(async {
        let pool = test_pool().await;
        let mut original = product(PRODUCT_ID, UNIT_ID, Some("MÃ-1"));
        original.units[0].name = "Thùng".into();
        save_product(&pool, original, "create", true).await.unwrap();
        let error = save_product(
            &pool,
            product(SECOND_PRODUCT_ID, OTHER_UNIT_ID, Some("mã-1")),
            "create",
            true,
        )
        .await
        .unwrap_err();
        assert!(matches!(error, ProductCommandError::SkuConflict { .. }));
        assert!(sqlx::query("INSERT INTO units SELECT ?, product_id, 'THÙNG', price, is_active, created_at, updated_at FROM units WHERE id = ?")
            .bind(OTHER_UNIT_ID).bind(UNIT_ID).execute(&pool).await.is_err());
    });
}

#[test]
fn failures_after_first_unit_write_rollback_both_create_and_update() {
    tauri::async_runtime::block_on(async {
        let pool = test_pool().await;
        sqlx::raw_sql("CREATE TRIGGER fail_unit_insert BEFORE INSERT ON units WHEN NEW.name = 'Injected failure' BEGIN SELECT RAISE(ABORT, 'injected'); END;")
            .execute(&pool).await.unwrap();
        let original = product(PRODUCT_ID, UNIT_ID, None);
        let mut invalid = original.clone();
        let mut second = original.units[0].clone();
        second.id = OTHER_UNIT_ID.into();
        second.name = "Injected failure".into();
        invalid.units.push(second);
        assert!(save_product(&pool, invalid.clone(), "create", true)
            .await
            .is_err());
        assert_eq!(row_count(&pool, "products").await, 0);
        assert_eq!(row_count(&pool, "units").await, 0);

        save_product(&pool, original, "create", true).await.unwrap();
        invalid.name = "Must roll back".into();
        invalid.units[0].price = 20_000;
        assert!(save_product(&pool, invalid, "update", false).await.is_err());
        let result = fetch_product(&pool, PRODUCT_ID).await.unwrap().unwrap();
        assert_eq!(result.name, "Coca Cola");
        assert_eq!(result.units[0].price, 10_000);
        assert_eq!(result.units[0].name, "Can");
        assert_eq!(row_count(&pool, "units").await, 1);
    });
}

#[test]
fn rejects_missing_product_updates_and_deactivations() {
    tauri::async_runtime::block_on(async {
        let pool = test_pool().await;
        assert!(
            save_product(&pool, product(PRODUCT_ID, UNIT_ID, None), "update", false)
                .await
                .is_err()
        );
        assert!(set_product_inactive(&pool, PRODUCT_ID, NOW).await.is_err());
        assert_eq!(row_count(&pool, "units").await, 0);
    });
}

#[test]
fn prevents_unit_omission_and_keeps_soft_deactivated_history() {
    tauri::async_runtime::block_on(async {
        let pool = test_pool().await;
        let mut original = product(PRODUCT_ID, UNIT_ID, None);
        let mut second = original.units[0].clone();
        second.id = OTHER_UNIT_ID.into();
        second.name = "Box".into();
        original.units.push(second);
        save_product(&pool, original.clone(), "create", true)
            .await
            .unwrap();
        let mut omitted = original.clone();
        omitted.units.pop();
        assert!(save_product(&pool, omitted, "update", false).await.is_err());
        original.units[1].is_active = false;
        save_product(&pool, original.clone(), "update", false)
            .await
            .unwrap();
        let saved = fetch_product(&pool, PRODUCT_ID).await.unwrap().unwrap();
        assert_eq!(saved.units.len(), 2);
        assert!(
            !saved
                .units
                .iter()
                .find(|u| u.id == OTHER_UNIT_ID)
                .unwrap()
                .is_active
        );
        original.units[1].is_active = true;
        assert!(save_product(&pool, original, "update", false)
            .await
            .is_err());
    });
}

#[test]
fn numeric_guards_reject_fractional_values_on_insert_and_update() {
    tauri::async_runtime::block_on(async {
        let pool = test_pool().await;
        save_product(&pool, product(PRODUCT_ID, UNIT_ID, None), "create", true)
            .await
            .unwrap();
        assert!(sqlx::query("UPDATE units SET price = 10.5")
            .execute(&pool)
            .await
            .is_err());
        assert!(sqlx::query("INSERT INTO units SELECT ?, product_id, 'Box', 10.5, is_active, created_at, updated_at FROM units")
            .bind(OTHER_UNIT_ID).execute(&pool).await.is_err());
        sqlx::query("INSERT INTO invoices(id, invoice_number, created_at, updated_at) VALUES('invoice', 1, ?, ?)")
            .bind(NOW).bind(NOW).execute(&pool).await.unwrap();
        for column in ["invoice_number", "total"] {
            assert!(sqlx::query(&format!("UPDATE invoices SET {column} = 1.5"))
                .execute(&pool)
                .await
                .is_err());
        }
        sqlx::query("INSERT INTO invoice_items (id, invoice_id, product_id, unit_id, product_name, product_sku, product_brand, unit_name, unit_price, quantity, subtotal, created_at) VALUES('item', 'invoice', ?, ?, 'Coca Cola', NULL, NULL, 'Can', 2, 2, 4, ?)")
            .bind(PRODUCT_ID).bind(UNIT_ID).bind(NOW).execute(&pool).await.unwrap();
        for statement in [
            "UPDATE invoice_items SET unit_price = 1.5, subtotal = 3",
            "UPDATE invoice_items SET quantity = 1.5, subtotal = 3",
            "UPDATE invoice_items SET unit_price = 1.25, subtotal = 2.5",
        ] {
            assert!(sqlx::query(statement).execute(&pool).await.is_err());
        }
        // Integer arithmetic and historical snapshots survive catalog edits.
        set_product_inactive(&pool, PRODUCT_ID, NOW).await.unwrap();
        let snapshot: String = sqlx::query_scalar("SELECT product_name FROM invoice_items")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(snapshot, "Coca Cola");
    });
}

#[test]
fn orphaned_product_is_not_silently_hidden_by_reads() {
    tauri::async_runtime::block_on(async {
        let pool = test_pool().await;
        sqlx::query(
            "INSERT INTO products(id,name,created_at,updated_at) VALUES(?, 'Corrupt', ?, ?)",
        )
        .bind(PRODUCT_ID)
        .bind(NOW)
        .bind(NOW)
        .execute(&pool)
        .await
        .unwrap();
        assert!(fetch_product(&pool, PRODUCT_ID)
            .await
            .unwrap()
            .unwrap()
            .units
            .is_empty());
    });
}

const INVOICE_ID: &str = "55555555-5555-4555-8555-555555555555";
const SECOND_INVOICE_ID: &str = "66666666-6666-4666-8666-666666666666";
const ITEM_ID: &str = "77777777-7777-4777-8777-777777777777";
const SECOND_ITEM_ID: &str = "88888888-8888-4888-8888-888888888888";

fn invoice_item(id: &str, invoice_id: &str, product_id: &str, unit_id: &str) -> InvoiceItemRecord {
    InvoiceItemRecord {
        id: id.to_string(),
        invoice_id: invoice_id.to_string(),
        product_id: product_id.to_string(),
        unit_id: unit_id.to_string(),
        product_name: "Coca Cola".to_string(),
        product_sku: Some("SKU-1".to_string()),
        product_brand: None,
        unit_name: "Can".to_string(),
        unit_price: 10_000,
        quantity: 2,
        subtotal: 20_000,
        discount_basis_points: 0,
        created_at: NOW.to_string(),
    }
}

#[test]
fn creates_invoice_draft_with_atomic_sequential_numbers() {
    tauri::async_runtime::block_on(async {
        let pool = test_pool().await;
        let draft1 = insert_invoice_draft(
            &pool,
            CreateInvoiceDraftInput {
                id: INVOICE_ID.to_string(),
                created_at: NOW.to_string(),
            },
        )
        .await
        .unwrap();
        assert_eq!(draft1.invoice_number, 1);
        assert_eq!(draft1.status, "draft");
        assert_eq!(draft1.total, 0);

        let draft2 = insert_invoice_draft(
            &pool,
            CreateInvoiceDraftInput {
                id: SECOND_INVOICE_ID.to_string(),
                created_at: NOW.to_string(),
            },
        )
        .await
        .unwrap();
        assert_eq!(draft2.invoice_number, 2);
    });
}

#[test]
fn saves_draft_items_and_recalculates_total_atomically() {
    tauri::async_runtime::block_on(async {
        let pool = test_pool().await;
        save_product(&pool, product(PRODUCT_ID, UNIT_ID, None), "create", true)
            .await
            .unwrap();

        let mut draft = insert_invoice_draft(
            &pool,
            CreateInvoiceDraftInput {
                id: INVOICE_ID.to_string(),
                created_at: NOW.to_string(),
            },
        )
        .await
        .unwrap();

        let item = invoice_item(ITEM_ID, INVOICE_ID, PRODUCT_ID, UNIT_ID);
        draft.items.push(item);
        draft.total = 20_000;
        draft.updated_at = NOW.to_string();

        persist_draft_items_and_total(&pool, draft).await.unwrap();

        let loaded = fetch_invoice(&pool, INVOICE_ID).await.unwrap().unwrap();
        assert_eq!(loaded.total, 20_000);
        assert_eq!(loaded.items.len(), 1);
        assert_eq!(loaded.items[0].product_name, "Coca Cola");
    });
}

#[test]
fn completes_invoice_and_rejects_empty_draft() {
    tauri::async_runtime::block_on(async {
        let pool = test_pool().await;
        save_product(&pool, product(PRODUCT_ID, UNIT_ID, None), "create", true)
            .await
            .unwrap();

        let mut draft = insert_invoice_draft(
            &pool,
            CreateInvoiceDraftInput {
                id: INVOICE_ID.to_string(),
                created_at: NOW.to_string(),
            },
        )
        .await
        .unwrap();

        // Không cho phép hoàn tất nếu không có item
        draft.status = "completed".to_string();
        draft.completed_at = Some(NOW.to_string());
        assert!(persist_completed_invoice(&pool, draft.clone()).await.is_err());

        // Thêm item và hoàn tất
        draft.items.push(invoice_item(ITEM_ID, INVOICE_ID, PRODUCT_ID, UNIT_ID));
        draft.total = 20_000;
        persist_completed_invoice(&pool, draft).await.unwrap();

        let loaded = fetch_invoice(&pool, INVOICE_ID).await.unwrap().unwrap();
        assert_eq!(loaded.status, "completed");
        assert!(loaded.completed_at.is_some());
    });
}

#[test]
fn preserves_snapshots_after_catalog_mutations() {
    tauri::async_runtime::block_on(async {
        let pool = test_pool().await;
        let mut original_prod = product(PRODUCT_ID, UNIT_ID, None);
        save_product(&pool, original_prod.clone(), "create", true).await.unwrap();

        let mut draft = insert_invoice_draft(
            &pool,
            CreateInvoiceDraftInput {
                id: INVOICE_ID.to_string(),
                created_at: NOW.to_string(),
            },
        )
        .await
        .unwrap();

        draft.items.push(invoice_item(ITEM_ID, INVOICE_ID, PRODUCT_ID, UNIT_ID));
        draft.total = 20_000;
        draft.status = "completed".to_string();
        draft.completed_at = Some(NOW.to_string());
        persist_completed_invoice(&pool, draft).await.unwrap();

        // Bây giờ sửa tên và giá sản phẩm trong catalog
        original_prod.name = "Pepsi Max".to_string();
        original_prod.units[0].price = 99_000;
        save_product(&pool, original_prod, "update", false).await.unwrap();

        // Hóa đơn cũ đọc lên vẫn giữ nguyên snapshot "Coca Cola" giá 10,000
        let loaded = fetch_invoice(&pool, INVOICE_ID).await.unwrap().unwrap();
        assert_eq!(loaded.items[0].product_name, "Coca Cola");
        assert_eq!(loaded.items[0].unit_price, 10_000);
    });
}

#[test]
fn overwrites_completed_invoice_preserving_identities() {
    tauri::async_runtime::block_on(async {
        let pool = test_pool().await;
        save_product(&pool, product(PRODUCT_ID, UNIT_ID, None), "create", true).await.unwrap();

        let mut invoice = insert_invoice_draft(
            &pool,
            CreateInvoiceDraftInput {
                id: INVOICE_ID.to_string(),
                created_at: NOW.to_string(),
            },
        )
        .await
        .unwrap();

        invoice.items.push(invoice_item(ITEM_ID, INVOICE_ID, PRODUCT_ID, UNIT_ID));
        invoice.total = 20_000;
        invoice.status = "completed".to_string();
        invoice.completed_at = Some(NOW.to_string());
        persist_completed_invoice(&pool, invoice.clone()).await.unwrap();

        // Ghi đè với số lượng mới
        let mut updated = invoice.clone();
        updated.items[0].quantity = 5;
        updated.items[0].subtotal = 50_000;
        updated.total = 50_000;
        updated.updated_at = "2026-01-02T00:00:00.000Z".to_string();

        persist_overwrite_completed(&pool, updated).await.unwrap();

        let loaded = fetch_invoice(&pool, INVOICE_ID).await.unwrap().unwrap();
        assert_eq!(loaded.total, 50_000);
        assert_eq!(loaded.invoice_number, 1);
        assert_eq!(loaded.created_at, NOW);
        assert_eq!(loaded.completed_at, Some(NOW.to_string()));
    });
}

#[test]
fn file_database_reopens_committed_invoice_draft() {
    tauri::async_runtime::block_on(async {
        let file = TestDatabaseFile::new();
        let pool = open_database(file.options()).await.unwrap();
        save_product(&pool, product(PRODUCT_ID, UNIT_ID, None), "create", true).await.unwrap();

        let mut draft = insert_invoice_draft(
            &pool,
            CreateInvoiceDraftInput {
                id: INVOICE_ID.to_string(),
                created_at: NOW.to_string(),
            },
        )
        .await
        .unwrap();
        draft.items.push(invoice_item(ITEM_ID, INVOICE_ID, PRODUCT_ID, UNIT_ID));
        draft.total = 20_000;
        persist_draft_items_and_total(&pool, draft).await.unwrap();
        pool.close().await;

        // Khởi động lại database từ file
        let pool = open_database(file.options()).await.unwrap();
        let loaded = fetch_invoice(&pool, INVOICE_ID).await.unwrap().unwrap();
        assert_eq!(loaded.invoice_number, 1);
        assert_eq!(loaded.items.len(), 1);
        assert_eq!(loaded.total, 20_000);
        pool.close().await;
    });
}

#[test]
fn rollback_on_injected_failure_preserves_invoice_state() {
    tauri::async_runtime::block_on(async {
        let pool = test_pool().await;
        save_product(&pool, product(PRODUCT_ID, UNIT_ID, None), "create", true).await.unwrap();

        let mut draft = insert_invoice_draft(
            &pool,
            CreateInvoiceDraftInput {
                id: INVOICE_ID.to_string(),
                created_at: NOW.to_string(),
            },
        )
        .await
        .unwrap();

        let valid_item = invoice_item(ITEM_ID, INVOICE_ID, PRODUCT_ID, UNIT_ID);
        draft.items.push(valid_item);
        draft.total = 20_000;
        persist_draft_items_and_total(&pool, draft.clone()).await.unwrap();

        sqlx::query(&format!(
            "CREATE TEMP TRIGGER reject_second_invoice_item
             BEFORE INSERT ON invoice_items
             WHEN NEW.id = '{SECOND_ITEM_ID}'
             BEGIN SELECT RAISE(ABORT, 'injected invoice item failure'); END"
        ))
        .execute(&pool)
        .await
        .unwrap();

        let mut replacement = draft.clone();
        replacement
            .items
            .push(invoice_item(SECOND_ITEM_ID, INVOICE_ID, PRODUCT_ID, UNIT_ID));
        replacement.total = 40_000;

        let result = persist_draft_items_and_total(&pool, replacement).await;
        assert!(result.is_err());

        sqlx::query("DROP TRIGGER reject_second_invoice_item")
            .execute(&pool)
            .await
            .unwrap();

        // Hóa đơn trong DB vẫn giữ nguyên 1 item hợp lệ ban đầu, không bị lưu dở dang
        let loaded = fetch_invoice(&pool, INVOICE_ID).await.unwrap().unwrap();
        assert_eq!(loaded.items.len(), 1);
        assert_eq!(loaded.items[0].id, ITEM_ID);
        assert_eq!(loaded.total, 20_000);
    });
}

#[test]
fn rejects_mismatched_totals_and_rolls_back_across_all_write_operations() {
    tauri::async_runtime::block_on(async {
        let pool = test_pool().await;
        save_product(&pool, product(PRODUCT_ID, UNIT_ID, None), "create", true).await.unwrap();

        let mut draft = insert_invoice_draft(
            &pool,
            CreateInvoiceDraftInput {
                id: INVOICE_ID.to_string(),
                created_at: NOW.to_string(),
            },
        )
        .await
        .unwrap();

        let item = invoice_item(ITEM_ID, INVOICE_ID, PRODUCT_ID, UNIT_ID);
        draft.items.push(item.clone());

        // 1. Mismatch on save_draft
        draft.total = 10_000; // Expected 20_000
        assert!(persist_draft_items_and_total(&pool, draft.clone()).await.is_err());
        let check1 = fetch_invoice(&pool, INVOICE_ID).await.unwrap().unwrap();
        assert_eq!(check1.total, 0);
        assert_eq!(check1.items.len(), 0);

        // 2. Mismatch on completion
        draft.total = 99_999;
        draft.status = "completed".to_string();
        draft.completed_at = Some(NOW.to_string());
        assert!(persist_completed_invoice(&pool, draft.clone()).await.is_err());
        let check2 = fetch_invoice(&pool, INVOICE_ID).await.unwrap().unwrap();
        assert_eq!(check2.status, "draft");
        assert_eq!(check2.total, 0);

        // Complete correctly first
        draft.total = 20_000;
        persist_completed_invoice(&pool, draft.clone()).await.unwrap();

        // 3. Mismatch on overwrite_completed
        let mut overwrite = draft.clone();
        let mut second_item = item.clone();
        second_item.id = SECOND_ITEM_ID.to_string();
        overwrite.items.push(second_item);
        overwrite.total = 99_999; // Expected 40_000
        assert!(persist_overwrite_completed(&pool, overwrite).await.is_err());

        // Verify completed invoice was untouched
        let check3 = fetch_invoice(&pool, INVOICE_ID).await.unwrap().unwrap();
        assert_eq!(check3.total, 20_000);
        assert_eq!(check3.items.len(), 1);
    });
}

#[test]
fn rejects_arithmetic_overflow_and_safe_integer_limit() {
    tauri::async_runtime::block_on(async {
        let pool = test_pool().await;
        save_product(&pool, product(PRODUCT_ID, UNIT_ID, None), "create", true).await.unwrap();

        let mut draft = insert_invoice_draft(
            &pool,
            CreateInvoiceDraftInput {
                id: INVOICE_ID.to_string(),
                created_at: NOW.to_string(),
            },
        )
        .await
        .unwrap();

        let mut unsafe_item = invoice_item(ITEM_ID, INVOICE_ID, PRODUCT_ID, UNIT_ID);
        unsafe_item.unit_price = 10_000_000_000_000_000;
        unsafe_item.quantity = 1;
        unsafe_item.subtotal = unsafe_item.unit_price;
        draft.items.push(unsafe_item);
        draft.total = 10_000_000_000_000_000;

        assert!(persist_draft_items_and_total(&pool, draft.clone()).await.is_err());

        let mut overflow_item = invoice_item(ITEM_ID, INVOICE_ID, PRODUCT_ID, UNIT_ID);
        overflow_item.unit_price = i64::MAX;
        overflow_item.quantity = 2;
        overflow_item.subtotal = 0;
        draft.items = vec![overflow_item];
        draft.total = 0;
        assert!(persist_draft_items_and_total(&pool, draft).await.is_err());

        let loaded = fetch_invoice(&pool, INVOICE_ID).await.unwrap().unwrap();
        assert_eq!(loaded.total, 0);
        assert_eq!(loaded.items.len(), 0);
    });
}

#[test]
fn validates_draft_identity_and_timestamp_before_insertion() {
    tauri::async_runtime::block_on(async {
        let pool = test_pool().await;

        // Invalid UUID
        let bad_id = insert_invoice_draft(
            &pool,
            CreateInvoiceDraftInput {
                id: "not-a-valid-uuid".to_string(),
                created_at: NOW.to_string(),
            },
        )
        .await;
        assert!(bad_id.is_err());

        // Non-v4 UUID (version 1)
        let non_v4 = insert_invoice_draft(
            &pool,
            CreateInvoiceDraftInput {
                id: "11111111-1111-1111-8111-111111111111".to_string(),
                created_at: NOW.to_string(),
            },
        )
        .await;
        assert!(non_v4.is_err());

        // Invalid ISO timestamp
        let bad_time = insert_invoice_draft(
            &pool,
            CreateInvoiceDraftInput {
                id: INVOICE_ID.to_string(),
                created_at: "2026-01-01 00:00:00".to_string(),
            },
        )
        .await;
        assert!(bad_time.is_err());

        let impossible_date = insert_invoice_draft(
            &pool,
            CreateInvoiceDraftInput {
                id: INVOICE_ID.to_string(),
                created_at: "2026-02-31T00:00:00.000Z".to_string(),
            },
        )
        .await;
        assert!(impossible_date.is_err());

        // Verify database is completely empty
        assert_eq!(row_count(&pool, "invoices").await, 0);
    });
}

#[test]
fn rejects_invalid_timestamps_before_mutating_existing_invoices() {
    tauri::async_runtime::block_on(async {
        let pool = test_pool().await;
        save_product(&pool, product(PRODUCT_ID, UNIT_ID, None), "create", true)
            .await
            .unwrap();
        let mut draft = insert_invoice_draft(
            &pool,
            CreateInvoiceDraftInput {
                id: INVOICE_ID.to_string(),
                created_at: NOW.to_string(),
            },
        )
        .await
        .unwrap();
        draft
            .items
            .push(invoice_item(ITEM_ID, INVOICE_ID, PRODUCT_ID, UNIT_ID));
        draft.total = 20_000;

        let mut invalid_save = draft.clone();
        invalid_save.updated_at = "2026-04-31T00:00:00.000Z".to_string();
        assert!(persist_draft_items_and_total(&pool, invalid_save).await.is_err());

        let mut invalid_item = draft.clone();
        invalid_item.items[0].created_at = "2025-02-29T00:00:00.000Z".to_string();
        assert!(persist_draft_items_and_total(&pool, invalid_item).await.is_err());

        let unchanged = fetch_invoice(&pool, INVOICE_ID).await.unwrap().unwrap();
        assert_eq!(unchanged.total, 0);
        assert!(unchanged.items.is_empty());

        draft.status = "completed".to_string();
        draft.completed_at = Some("2026-02-31T00:00:00.000Z".to_string());
        assert!(persist_completed_invoice(&pool, draft).await.is_err());

        let unchanged = fetch_invoice(&pool, INVOICE_ID).await.unwrap().unwrap();
        assert_eq!(unchanged.status, "draft");
        assert_eq!(unchanged.total, 0);
        assert!(unchanged.items.is_empty());

        let mut completed = unchanged;
        completed
            .items
            .push(invoice_item(ITEM_ID, INVOICE_ID, PRODUCT_ID, UNIT_ID));
        completed.total = 20_000;
        completed.status = "completed".to_string();
        completed.completed_at = Some(NOW.to_string());
        persist_completed_invoice(&pool, completed.clone())
            .await
            .unwrap();

        completed.updated_at = "2026-02-31T00:00:00.000Z".to_string();
        assert!(persist_overwrite_completed(&pool, completed).await.is_err());

        let unchanged = fetch_invoice(&pool, INVOICE_ID).await.unwrap().unwrap();
        assert_eq!(unchanged.status, "completed");
        assert_eq!(unchanged.total, 20_000);
        assert_eq!(unchanged.items.len(), 1);
    });
}

#[test]
fn enforces_product_unit_ownership_and_rolls_back() {
    tauri::async_runtime::block_on(async {
        let pool = test_pool().await;
        save_product(&pool, product(PRODUCT_ID, UNIT_ID, None), "create", true).await.unwrap();
        save_product(
            &pool,
            product(SECOND_PRODUCT_ID, OTHER_UNIT_ID, None),
            "create",
            true,
        )
        .await
        .unwrap();

        let mut draft = insert_invoice_draft(
            &pool,
            CreateInvoiceDraftInput {
                id: INVOICE_ID.to_string(),
                created_at: NOW.to_string(),
            },
        )
        .await
        .unwrap();

        // Pair PRODUCT_ID with OTHER_UNIT_ID (belongs to SECOND_PRODUCT_ID)
        let mismatched_item = invoice_item(ITEM_ID, INVOICE_ID, PRODUCT_ID, OTHER_UNIT_ID);
        draft.items.push(mismatched_item);
        draft.total = 20_000;

        // 1. Rollback on save_draft
        assert!(persist_draft_items_and_total(&pool, draft.clone()).await.is_err());
        let check1 = fetch_invoice(&pool, INVOICE_ID).await.unwrap().unwrap();
        assert_eq!(check1.items.len(), 0);

        // 2. Rollback on complete
        draft.status = "completed".to_string();
        draft.completed_at = Some(NOW.to_string());
        assert!(persist_completed_invoice(&pool, draft.clone()).await.is_err());
        let check2 = fetch_invoice(&pool, INVOICE_ID).await.unwrap().unwrap();
        assert_eq!(check2.status, "draft");
        assert_eq!(check2.items.len(), 0);

        // Complete valid invoice
        draft.items[0] = invoice_item(ITEM_ID, INVOICE_ID, PRODUCT_ID, UNIT_ID);
        persist_completed_invoice(&pool, draft.clone()).await.unwrap();

        // 3. Rollback on overwrite_completed
        let mut overwrite = draft.clone();
        overwrite.items[0] = invoice_item(ITEM_ID, INVOICE_ID, PRODUCT_ID, OTHER_UNIT_ID);
        assert!(persist_overwrite_completed(&pool, overwrite).await.is_err());
        let check3 = fetch_invoice(&pool, INVOICE_ID).await.unwrap().unwrap();
        assert_eq!(check3.items[0].unit_id, UNIT_ID);
    });
}

#[test]
fn allows_inactive_product_and_unit_ownership_for_historical_items() {
    tauri::async_runtime::block_on(async {
        let pool = test_pool().await;
        save_product(&pool, product(PRODUCT_ID, UNIT_ID, None), "create", true).await.unwrap();

        let mut draft = insert_invoice_draft(
            &pool,
            CreateInvoiceDraftInput {
                id: INVOICE_ID.to_string(),
                created_at: NOW.to_string(),
            },
        )
        .await
        .unwrap();

        let item = invoice_item(ITEM_ID, INVOICE_ID, PRODUCT_ID, UNIT_ID);
        draft.items.push(item);
        draft.total = 20_000;
        draft.status = "completed".to_string();
        draft.completed_at = Some(NOW.to_string());
        persist_completed_invoice(&pool, draft.clone()).await.unwrap();

        set_product_inactive(&pool, PRODUCT_ID, NOW).await.unwrap();
        sqlx::query("UPDATE units SET is_active = 0 WHERE id = ?")
            .bind(UNIT_ID)
            .execute(&pool)
            .await
            .unwrap();

        draft.items[0].quantity = 3;
        draft.items[0].subtotal = 30_000;
        draft.total = 30_000;
        draft.updated_at = "2026-01-02T00:00:00.000Z".to_string();
        persist_overwrite_completed(&pool, draft).await.unwrap();

        let loaded = fetch_invoice(&pool, INVOICE_ID).await.unwrap().unwrap();
        assert_eq!(loaded.items.len(), 1);
        assert_eq!(loaded.items[0].product_id, PRODUCT_ID);
        assert_eq!(loaded.items[0].unit_id, UNIT_ID);
        assert_eq!(loaded.total, 30_000);
    });
}

fn product_alias(
    id: &str,
    product_id: &str,
    alias: &str,
    normalized_alias: &str,
    source_key: Option<&str>,
) -> ProductAliasRecord {
    ProductAliasRecord {
        id: id.to_string(),
        product_id: product_id.to_string(),
        alias: alias.to_string(),
        normalized_alias: normalized_alias.to_string(),
        source_key: source_key.map(str::to_string),
        source_name_raw: source_key.map(|_| "Nhà phân phối Miền Nam".to_string()),
        unit_name: Some("Thùng".to_string()),
        created_at: NOW.to_string(),
    }
}

#[test]
fn product_alias_migration_enforces_scope_and_preserves_ambiguity() {
    tauri::async_runtime::block_on(async {
        const ALIAS_ID: &str = "55555555-5555-4555-8555-555555555555";
        const SECOND_ALIAS_ID: &str = "66666666-6666-4666-8666-666666666666";
        const THIRD_ALIAS_ID: &str = "77777777-7777-4777-8777-777777777777";
        const FOURTH_ALIAS_ID: &str = "88888888-8888-4888-8888-888888888888";

        let pool = test_pool().await;
        save_product(&pool, product(PRODUCT_ID, UNIT_ID, None), "create", true)
            .await
            .unwrap();
        save_product(
            &pool,
            product(SECOND_PRODUCT_ID, OTHER_UNIT_ID, None),
            "create",
            true,
        )
        .await
        .unwrap();

        insert_product_alias(
            &pool,
            product_alias(ALIAS_ID, PRODUCT_ID, "Cà phê sữa", "ca phe sua", None),
        )
        .await
        .unwrap();

        let duplicate = insert_product_alias(
            &pool,
            product_alias(
                SECOND_ALIAS_ID,
                PRODUCT_ID,
                "CA PHE SUA",
                "ca phe sua",
                None,
            ),
        )
        .await
        .unwrap_err();
        assert!(matches!(
            duplicate,
            ProductCommandError::AliasConflict { .. }
        ));

        // A scoped mapping is distinct from a global alias, and the same global
        // phrase can remain ambiguous across separate Products.
        insert_product_alias(
            &pool,
            product_alias(
                SECOND_ALIAS_ID,
                PRODUCT_ID,
                "Cà phê sữa",
                "ca phe sua",
                Some("tax:0123456789"),
            ),
        )
        .await
        .unwrap();
        insert_product_alias(
            &pool,
            product_alias(
                THIRD_ALIAS_ID,
                SECOND_PRODUCT_ID,
                "Cà phê sữa",
                "ca phe sua",
                None,
            ),
        )
        .await
        .unwrap();

        assert_eq!(fetch_active_product_aliases(&pool).await.unwrap().len(), 3);
        set_product_inactive(&pool, PRODUCT_ID, NOW).await.unwrap();
        let active_aliases = fetch_active_product_aliases(&pool).await.unwrap();
        assert_eq!(active_aliases.len(), 1);
        assert_eq!(active_aliases[0].id, THIRD_ALIAS_ID);

        delete_product_alias(&pool, THIRD_ALIAS_ID).await.unwrap();
        assert!(fetch_active_product_aliases(&pool).await.unwrap().is_empty());

        let invalid = insert_product_alias(
            &pool,
            product_alias(
                FOURTH_ALIAS_ID,
                SECOND_PRODUCT_ID,
                " padded ",
                "padded",
                None,
            ),
        )
        .await;
        assert!(invalid.is_err());

        let indexes: Vec<String> = sqlx::query_scalar(
            "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'product_aliases'",
        )
        .fetch_all(&pool)
        .await
        .unwrap();
        assert!(indexes.iter().any(|name| name == "product_aliases_product_idx"));
        assert!(indexes
            .iter()
            .any(|name| name == "product_aliases_global_lookup_idx"));
        assert!(indexes
            .iter()
            .any(|name| name == "product_aliases_scoped_lookup_idx"));
    });
}

#[test]
fn upgrades_existing_invoice_rows_with_zero_discount() {
    use sqlx::migrate::Migrate;
    tauri::async_runtime::block_on(async {
        let pool = sqlx::sqlite::SqlitePoolOptions::new().max_connections(1)
            .connect_with(connection_options().in_memory(true)).await.unwrap();
        {
            let mut connection = pool.acquire().await.unwrap();
            connection.ensure_migrations_table().await.unwrap();
            for migration in sqlx::migrate!("./migrations").iter().take(3) {
                connection.apply(migration).await.unwrap();
            }
        }
        save_product(&pool, product(PRODUCT_ID, UNIT_ID, None), "create", true).await.unwrap();
        insert_invoice_draft(&pool, CreateInvoiceDraftInput { id: INVOICE_ID.into(), created_at: NOW.into() }).await.unwrap();
        sqlx::query("INSERT INTO invoice_items (id, invoice_id, product_id, unit_id, product_name, product_sku, product_brand, unit_name, unit_price, quantity, subtotal, created_at) VALUES (?, ?, ?, ?, 'Original snapshot', NULL, NULL, 'Can', 10000, 2, 20000, ?)")
            .bind(ITEM_ID).bind(INVOICE_ID).bind(PRODUCT_ID).bind(UNIT_ID).bind(NOW).execute(&pool).await.unwrap();
        sqlx::query("UPDATE invoices SET total=20000").execute(&pool).await.unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        let invoice = fetch_invoice(&pool, INVOICE_ID).await.unwrap().unwrap();
        assert_eq!(invoice.total, 20_000);
        assert_eq!(invoice.items[0].discount_basis_points, 0);
        assert_eq!(invoice.items[0].product_name, "Original snapshot");
        for value in ["-1", "10001", "0.5", "'invalid'"] {
            assert!(sqlx::query(&format!("UPDATE invoice_items SET discount_basis_points={value}"))
                .execute(&pool).await.is_err());
        }
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
    });
}

#[test]
fn discounts_survive_reopen_completion_and_overwrite_and_reject_inconsistent_totals() {
    tauri::async_runtime::block_on(async {
        let file = TestDatabaseFile::new();
        let pool = open_database(file.options()).await.unwrap();
        save_product(&pool, product(PRODUCT_ID, UNIT_ID, None), "create", true).await.unwrap();
        let mut invoice = insert_invoice_draft(&pool, CreateInvoiceDraftInput { id: INVOICE_ID.into(), created_at: NOW.into() }).await.unwrap();
        let mut item = invoice_item(ITEM_ID, INVOICE_ID, PRODUCT_ID, UNIT_ID);
        item.quantity = 1;
        item.unit_price = 105;
        item.subtotal = 105;
        item.discount_basis_points = 1000;
        invoice.items.push(item);
        invoice.total = 94;
        persist_draft_items_and_total(&pool, invoice).await.unwrap();
        pool.close().await;
        let pool = open_database(file.options()).await.unwrap();
        let mut invoice = fetch_invoice(&pool, INVOICE_ID).await.unwrap().unwrap();
        assert_eq!(invoice.total, 94);
        assert_eq!(invoice.items[0].discount_basis_points, 1000);
        let mut invalid = invoice.clone();
        invalid.total = 95;
        assert!(persist_draft_items_and_total(&pool, invalid).await.is_err());
        invoice.status = "completed".into();
        invoice.completed_at = Some(NOW.into());
        persist_completed_invoice(&pool, invoice.clone()).await.unwrap();
        invoice.items[0].discount_basis_points = 10000;
        invoice.total = 0;
        persist_overwrite_completed(&pool, invoice).await.unwrap();
        let loaded = fetch_invoice(&pool, INVOICE_ID).await.unwrap().unwrap();
        assert_eq!(loaded.total, 0);
        assert_eq!(loaded.items[0].discount_basis_points, 10000);
        assert_eq!(loaded.completed_at.as_deref(), Some(NOW));
        pool.close().await;
    });
}

#[test]
fn discount_rounding_is_exact_at_safe_integer_limit_and_checks_gross_overflow() {
    let mut item = invoice_item(ITEM_ID, INVOICE_ID, PRODUCT_ID, UNIT_ID);
    item.quantity = 1;
    item.unit_price = MAX_SAFE_INTEGER;
    item.subtotal = MAX_SAFE_INTEGER;
    item.discount_basis_points = 5000;
    assert_eq!(calculate_and_validate_total(&[item.clone()], 4_503_599_627_370_495).unwrap(), 4_503_599_627_370_495);
    item.discount_basis_points = 10000;
    assert!(calculate_and_validate_total(&[item.clone(), item], 0).is_err());
}

#[test]
fn lists_invoices_filtered_by_status() {
    tauri::async_runtime::block_on(async {
        let pool = test_pool().await;
        insert_invoice_draft(
            &pool,
            CreateInvoiceDraftInput {
                id: INVOICE_ID.to_string(),
                created_at: NOW.to_string(),
            },
        )
        .await
        .unwrap();

        let drafts = fetch_invoices(&pool, Some("draft")).await.unwrap();
        assert_eq!(drafts.len(), 1);
        assert_eq!(drafts[0].id, INVOICE_ID);
        assert_eq!(drafts[0].status, "draft");

        let completed = fetch_invoices(&pool, Some("completed")).await.unwrap();
        assert_eq!(completed.len(), 0);

        let all = fetch_invoices(&pool, None).await.unwrap();
        assert_eq!(all.len(), 1);
        pool.close().await;
    });
}
