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
        fn report(name: &str, samples: &mut [Duration], p95_limit: f64, maximum_limit: f64) {
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
        report("get", &mut get, 50.0, 200.0);
        report("create", &mut create, 200.0, 1000.0);
        report("update", &mut update, 200.0, 1000.0);
        report("deactivate", &mut deactivate, 200.0, 1000.0);
        // Repository load only: IPC/JS rehydration and Fuse.js indexing are excluded.
        report("list_active_repository_only", &mut list, 500.0, 1000.0);
        pool.close().await;
        let mut reopen = Vec::new();
        for _ in 0..20 {
            let started = std::time::Instant::now();
            let pool = open_database(file.options()).await.unwrap();
            reopen.push(started.elapsed());
            pool.close().await;
        }
        // Same-process reopen, not a substitute for fresh-process startup runs.
        report("reopen_same_process", &mut reopen, 500.0, 1000.0);
    });
}
