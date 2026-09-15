// Explicit opt-in: cargo test --release catalog_benchmark -- --ignored --nocapture
#[test]
#[ignore = "file-backed release benchmark, not a routine unit test"]
fn catalog_benchmark() {
    if cfg!(debug_assertions) {
        panic!("Use --release for NFR measurements");
    }
    tauri::async_runtime::block_on(async {
        let file = TestDatabaseFile::new();
        let pool = open_database(file.options()).await.unwrap();
        let mut seed = pool.begin().await.unwrap();
        // Fixture construction is not included in measured operation times.
        sqlx::raw_sql("WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<10000)
          INSERT INTO products(id,sku,name,created_at,updated_at)
          SELECT printf('%08x-1111-4111-8111-111111111111',x), printf('SKU-%05d',x), printf('Sản phẩm %05d',x), '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z' FROM n;
          WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<10000), u(y) AS (VALUES(1),(2),(3),(4),(5))
          INSERT INTO units(id,product_id,name,price,created_at,updated_at)
          SELECT printf('%08x-2222-4222-8222-222222222222',x*5+y), printf('%08x-1111-4111-8111-111111111111',x), printf('Đơn vị %d',y), 10000*y, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z' FROM n CROSS JOIN u;")
          .execute(&mut *seed).await.unwrap();
        seed.commit().await.unwrap();
        assert_eq!(row_count(&pool, "products").await, 10000);
        assert_eq!(row_count(&pool, "units").await, 50000);
        let mut get = Vec::new();
        let mut create = Vec::new();
        let mut update = Vec::new();
        let mut deactivate = Vec::new();
        let mut list = Vec::new();
        // Warm up the repository read path once, including full catalog allocation.
        assert_eq!(fetch_products(&pool, None).await.unwrap().len(), 10000);
        for i in 0..101 {
            let id = format!("{:08x}-1111-4111-8111-111111111111", 1 + (i * 97) % 10000);
            let started = std::time::Instant::now();
            let mut record = fetch_product(&pool, &id).await.unwrap().unwrap();
            if i > 0 {
                get.push(started.elapsed());
            }
            assert_eq!(record.units.len(), 5);
            record.units[0].price += 1;
            let started = std::time::Instant::now();
            save_product(&pool, record, "update", false).await.unwrap();
            if i > 0 {
                update.push(started.elapsed());
            }
            let id = format!("{:08x}-3333-4333-8333-333333333333", i + 1);
            let mut record = product(
                &id,
                &format!("{:08x}-4444-4444-8444-444444444444", i + 1),
                None,
            );
            let unit = record.units[0].clone();
            record.units = (0..5)
                .map(|u| UnitRecord {
                    id: format!("{:08x}-4444-4444-8444-444444444444", i * 5 + u + 1),
                    name: format!("Unit {u}"),
                    ..unit.clone()
                })
                .collect();
            let started = std::time::Instant::now();
            save_product(&pool, record, "create", true).await.unwrap();
            if i > 0 {
                create.push(started.elapsed());
            }
            let started = std::time::Instant::now();
            set_product_inactive(&pool, &id, NOW).await.unwrap();
            if i > 0 {
                deactivate.push(started.elapsed());
            }
        }
        for _ in 0..20 {
            let started = std::time::Instant::now();
            let records = fetch_products(&pool, Some(true)).await.unwrap();
            list.push(started.elapsed());
            assert_eq!(records.len(), 10000);
        }
        benchmark_report("get", &mut get, 50.0, 200.0);
        benchmark_report("create", &mut create, 200.0, 1000.0);
        benchmark_report("update", &mut update, 200.0, 1000.0);
        benchmark_report("deactivate", &mut deactivate, 200.0, 1000.0);
        // Repository load only: IPC/JS rehydration and Fuse.js indexing are excluded.
        benchmark_report("list_active_repository_only", &mut list, 500.0, 1000.0);
        pool.close().await;
        let mut reopen = Vec::new();
        for _ in 0..20 {
            let started = std::time::Instant::now();
            let pool = open_database(file.options()).await.unwrap();
            reopen.push(started.elapsed());
            pool.close().await;
        }
        // Same-process reopen, not a substitute for fresh-process startup runs.
        benchmark_report("reopen_same_process", &mut reopen, 500.0, 1000.0);
    });
}

fn benchmark_report(name: &str, samples: &mut [Duration], p95_limit: f64, maximum_limit: f64) {
    samples.sort();
    let millis = |d: Duration| d.as_secs_f64() * 1000.0;
    let median = millis(samples[samples.len() / 2]);
    let p95 = millis(samples[(samples.len() * 95).div_ceil(100) - 1]);
    let max = millis(*samples.last().unwrap());
    println!(
        "BENCH {name} n={} median_ms={median:.3} p95_ms={p95:.3} max_ms={max:.3} pass={}",
        samples.len(),
        p95 <= p95_limit && max <= maximum_limit
    );
    assert!(
        p95 <= p95_limit && max <= maximum_limit,
        "{name} exceeded its benchmark budget"
    );
}

// Explicit opt-in: cargo test --release invoice_draft_benchmark -- --ignored --nocapture
#[test]
#[ignore = "file-backed release benchmark for NFR-PERF-007"]
fn invoice_draft_benchmark() {
    if cfg!(debug_assertions) {
        panic!("Use --release for NFR measurements");
    }
    tauri::async_runtime::block_on(async {
        let file = TestDatabaseFile::new();
        let pool = open_database(file.options()).await.unwrap();
        let mut seed = pool.begin().await.unwrap();
        // Fixture construction: 100 products with 1 unit each.
        sqlx::raw_sql(
            "WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<100)
             INSERT INTO products(id,sku,name,created_at,updated_at)
             SELECT printf('%08x-1111-4111-8111-111111111111',x), printf('SKU-%05d',x), printf('Sản phẩm %05d',x), '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z' FROM n;
             WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<100)
             INSERT INTO units(id,product_id,name,price,created_at,updated_at)
             SELECT printf('%08x-2222-4222-8222-222222222222',x), printf('%08x-1111-4111-8111-111111111111',x), 'Đơn vị 1', 10000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z' FROM n;",
        )
        .execute(&mut *seed)
        .await
        .unwrap();
        seed.commit().await.unwrap();

        let invoice_id = "00000001-9999-4999-8999-999999999999";
        insert_invoice_draft(
            &pool,
            CreateInvoiceDraftInput {
                id: invoice_id.to_string(),
                created_at: "2026-01-01T00:00:00.000Z".to_string(),
            },
        )
        .await
        .unwrap();

        let make_items = |count: usize| -> Vec<InvoiceItemRecord> {
            (1..=count)
                .map(|i| InvoiceItemRecord {
                    id: format!("{:08x}-7777-4777-8777-777777777777", i),
                    invoice_id: invoice_id.to_string(),
                    product_id: format!("{:08x}-1111-4111-8111-111111111111", i),
                    unit_id: format!("{:08x}-2222-4222-8222-222222222222", i),
                    product_name: format!("Sản phẩm {i:05}"),
                    product_sku: Some(format!("SKU-{i:05}")),
                    product_brand: None,
                    unit_name: "Đơn vị 1".to_string(),
                    unit_price: 10_000,
                    quantity: 1,
                    subtotal: 10_000,
                    discount_basis_points: 0,
                    note: None,
                    created_at: "2026-01-01T00:00:00.000Z".to_string(),
                })
                .collect()
        };

        // Warmup: save 10 items
        let warmup_items = make_items(10);
        let warmup_record = InvoiceRecord {
            id: invoice_id.to_string(),
            invoice_number: 1,
            status: "draft".to_string(),
            total: 100_000,
                old_debt: 0,
            customer_name: None,
            customer_phone: None,
            customer_address: None,
            customer_note: None,
            is_printed: false,
            printed_at: None,
            created_at: "2026-01-01T00:00:00.000Z".to_string(),
            updated_at: "2026-01-01T00:00:00.000Z".to_string(),
            completed_at: None,
            items: warmup_items,
        };
        persist_draft_items_and_total(&pool, warmup_record).await.unwrap();

        // 10 items benchmark (100 samples)
        let items_10 = make_items(10);
        let mut save_10_samples = Vec::new();
        for run in 1..=100 {
            let record = InvoiceRecord {
                id: invoice_id.to_string(),
                invoice_number: 1,
                status: "draft".to_string(),
                total: 100_000,
                old_debt: 0,
                customer_name: None,
                customer_phone: None,
                customer_address: None,
                customer_note: None,
                is_printed: false,
                printed_at: None,
                created_at: "2026-01-01T00:00:00.000Z".to_string(),
                updated_at: format!("2026-01-01T01:{:02}:{:02}.000Z", run / 60, run % 60),
                completed_at: None,
                items: items_10.clone(),
            };
            let started = std::time::Instant::now();
            persist_draft_items_and_total(&pool, record).await.unwrap();
            save_10_samples.push(started.elapsed());
        }
        benchmark_report("save_draft_10_items", &mut save_10_samples, 50.0, 150.0);

        // 50 items benchmark (100 samples)
        let items_50 = make_items(50);
        let mut save_50_samples = Vec::new();
        for run in 1..=100 {
            let record = InvoiceRecord {
                id: invoice_id.to_string(),
                invoice_number: 1,
                status: "draft".to_string(),
                total: 500_000,
                old_debt: 0,
                customer_name: None,
                customer_phone: None,
                customer_address: None,
                customer_note: None,
                is_printed: false,
                printed_at: None,
                created_at: "2026-01-01T00:00:00.000Z".to_string(),
                updated_at: format!("2026-01-01T02:{:02}:{:02}.000Z", run / 60, run % 60),
                completed_at: None,
                items: items_50.clone(),
            };
            let started = std::time::Instant::now();
            persist_draft_items_and_total(&pool, record).await.unwrap();
            save_50_samples.push(started.elapsed());
        }
        benchmark_report("save_draft_50_items", &mut save_50_samples, 150.0, 300.0);

        // 100 items benchmark (100 samples) - NFR-PERF-007 (budget <= 300 ms P95)
        let items_100 = make_items(100);
        let mut save_100_samples = Vec::new();
        for run in 1..=100 {
            let record = InvoiceRecord {
                id: invoice_id.to_string(),
                invoice_number: 1,
                status: "draft".to_string(),
                total: 1_000_000,
                old_debt: 0,
                customer_name: None,
                customer_phone: None,
                customer_address: None,
                customer_note: None,
                is_printed: false,
                printed_at: None,
                created_at: "2026-01-01T00:00:00.000Z".to_string(),
                updated_at: format!("2026-01-01T03:{:02}:{:02}.000Z", run / 60, run % 60),
                completed_at: None,
                items: items_100.clone(),
            };
            let started = std::time::Instant::now();
            persist_draft_items_and_total(&pool, record).await.unwrap();
            save_100_samples.push(started.elapsed());
        }
        benchmark_report("save_draft_100_items", &mut save_100_samples, 300.0, 500.0);

        pool.close().await;
    });
}
