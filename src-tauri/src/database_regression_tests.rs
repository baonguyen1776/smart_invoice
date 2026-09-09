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
        sqlx::query("INSERT INTO invoice_items VALUES('item', 'invoice', ?, ?, 'Coca Cola', NULL, NULL, 'Can', 2, 2, 4, ?)")
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
