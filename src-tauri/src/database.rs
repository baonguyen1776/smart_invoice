use serde::{Deserialize, Serialize};
use sqlx::{sqlite::SqliteConnectOptions, QueryBuilder, Row, Sqlite, SqlitePool};
use std::{
    collections::{HashMap, HashSet},
    time::Duration,
};
use tauri::{Manager, State};

const DATABASE_NAME: &str = "smart-invoice.db";

pub struct DatabaseState(pub SqlitePool);

fn connection_options() -> SqliteConnectOptions {
    SqliteConnectOptions::new()
        .foreign_keys(true)
        .busy_timeout(Duration::from_secs(2))
        .collation("UNICODE_LOWER", |left, right| {
            left.to_lowercase().cmp(&right.to_lowercase())
        })
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnitRecord {
    pub id: String,
    pub product_id: String,
    pub name: String,
    pub price: i64,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductRecord {
    pub id: String,
    pub sku: Option<String>,
    pub name: String,
    pub brand: Option<String>,
    pub category: Option<String>,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
    pub units: Vec<UnitRecord>,
}

#[derive(Debug, Serialize)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum ProductCommandError {
    SkuConflict { sku: String },
    Persistence { operation: String, message: String },
}

pub fn initialize(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let data_dir = app.path().app_data_dir()?;
    std::fs::create_dir_all(&data_dir)?;
    let database_path = data_dir.join(DATABASE_NAME);
    let options = connection_options()
        .filename(database_path)
        .create_if_missing(true)
        .foreign_keys(true)
        .busy_timeout(Duration::from_secs(2));

    let pool = tauri::async_runtime::block_on(open_database(options))?;
    app.manage(DatabaseState(pool));
    Ok(())
}

async fn open_database(
    options: SqliteConnectOptions,
) -> Result<SqlitePool, Box<dyn std::error::Error>> {
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .max_lifetime(None)
        .idle_timeout(None)
        .acquire_timeout(Duration::from_secs(2))
        .connect_with(options)
        .await?;
    if let Err(error) = sqlx::migrate!("./migrations").run(&pool).await {
        pool.close().await;
        return Err(error.into());
    }
    Ok(pool)
}

#[tauri::command]
pub async fn create_product(
    state: State<'_, DatabaseState>,
    product: ProductRecord,
) -> Result<(), ProductCommandError> {
    save_product(&state.0, product, "create", true).await
}

#[tauri::command]
pub async fn get_product(
    state: State<'_, DatabaseState>,
    product_id: String,
) -> Result<Option<ProductRecord>, ProductCommandError> {
    fetch_product(&state.0, &product_id)
        .await
        .map_err(|error| persistence("get", error))
}

#[tauri::command]
pub async fn update_product(
    state: State<'_, DatabaseState>,
    product: ProductRecord,
) -> Result<(), ProductCommandError> {
    save_product(&state.0, product, "update", false).await
}

#[tauri::command]
pub async fn deactivate_product(
    state: State<'_, DatabaseState>,
    product: ProductRecord,
) -> Result<(), ProductCommandError> {
    set_product_inactive(&state.0, &product.id, &product.updated_at)
        .await
        .map_err(|error| persistence("deactivate", error))
}

#[tauri::command]
pub async fn list_products(
    state: State<'_, DatabaseState>,
    filter: String,
) -> Result<Vec<ProductRecord>, ProductCommandError> {
    let activity = match filter.as_str() {
        "active" => Some(true),
        "inactive" => Some(false),
        "all" => None,
        _ => return Err(persistence_message("list", "unsupported activity filter")),
    };

    fetch_products(&state.0, activity)
        .await
        .map_err(|error| persistence("list", error))
}

async fn save_product(
    pool: &SqlitePool,
    product: ProductRecord,
    operation: &'static str,
    is_create: bool,
) -> Result<(), ProductCommandError> {
    validate_product(&product, operation)?;
    let mut transaction = pool
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(|error| persistence(operation, error))?;

    let product_result = if is_create {
        sqlx::query(
            "INSERT INTO products
             (id, sku, name, brand, category, is_active, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&product.id)
        .bind(&product.sku)
        .bind(&product.name)
        .bind(&product.brand)
        .bind(&product.category)
        .bind(product.is_active)
        .bind(&product.created_at)
        .bind(&product.updated_at)
        .execute(&mut *transaction)
        .await
    } else {
        sqlx::query(
            "UPDATE products
             SET sku = ?, name = ?, brand = ?, category = ?, is_active = ?, updated_at = ?
             WHERE id = ?",
        )
        .bind(&product.sku)
        .bind(&product.name)
        .bind(&product.brand)
        .bind(&product.category)
        .bind(product.is_active)
        .bind(&product.updated_at)
        .bind(&product.id)
        .execute(&mut *transaction)
        .await
    };

    let result = product_result
        .map_err(|error| map_write_error(operation, product.sku.as_deref(), error))?;
    if result.rows_affected() != 1 {
        return Err(persistence_message(operation, "Product no longer exists."));
    }

    if !is_create {
        let existing = sqlx::query("SELECT id, name, is_active FROM units WHERE product_id = ?")
            .bind(&product.id)
            .fetch_all(&mut *transaction)
            .await
            .map_err(|error| persistence(operation, error))?;
        let mut reserved: HashSet<String> = product
            .units
            .iter()
            .map(|unit| unit.name.to_lowercase())
            .collect();
        for row in &existing {
            let id: String = row.get("id");
            let name: String = row.get("name");
            reserved.insert(name.to_lowercase());
            let Some(unit) = product.units.iter().find(|unit| unit.id == id) else {
                return Err(persistence_message(
                    operation,
                    "Existing Units must be retained, using soft deactivation.",
                ));
            };
            if row.get::<i64, _>("is_active") == 0 && unit.is_active {
                return Err(persistence_message(
                    operation,
                    "Inactive Units cannot be reactivated.",
                ));
            }
        }
        // Free the old names inside the same transaction so valid swaps/cycles work.
        // Never delete Units: invoice references and original timestamps must survive.
        for row in &existing {
            let id: String = row.get("id");
            let mut temporary = format!("__rename_{id}");
            while !reserved.insert(temporary.to_lowercase()) {
                temporary.push('_');
            }
            sqlx::query("UPDATE units SET name = ? WHERE id = ? AND product_id = ?")
                .bind(temporary)
                .bind(id)
                .bind(&product.id)
                .execute(&mut *transaction)
                .await
                .map_err(|error| persistence(operation, error))?;
        }
    }

    for unit in &product.units {
        let insert = "INSERT INTO units
             (id, product_id, name, price, is_active, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)";
        let upsert = "INSERT INTO units
             (id, product_id, name, price, is_active, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               name = excluded.name,
               price = excluded.price,
               is_active = excluded.is_active,
               updated_at = excluded.updated_at
             WHERE units.product_id = excluded.product_id";
        let result = sqlx::query(if is_create { insert } else { upsert })
            .bind(&unit.id)
            .bind(&unit.product_id)
            .bind(&unit.name)
            .bind(unit.price)
            .bind(unit.is_active)
            .bind(&unit.created_at)
            .bind(&unit.updated_at)
            .execute(&mut *transaction)
            .await
            .map_err(|error| map_write_error(operation, product.sku.as_deref(), error))?;

        if result.rows_affected() != 1 {
            return Err(persistence_message(operation, "Unit ownership conflict"));
        }
    }

    transaction
        .commit()
        .await
        .map_err(|error| persistence(operation, error))
}

fn validate_product(product: &ProductRecord, operation: &str) -> Result<(), ProductCommandError> {
    let mut ids = HashSet::new();
    let mut names = HashSet::new();
    if product.units.is_empty() || !product.units.iter().any(|unit| unit.is_active) {
        return Err(persistence_message(
            operation,
            "Product requires an active Unit.",
        ));
    }
    for unit in &product.units {
        if unit.product_id != product.id || !ids.insert(&unit.id) {
            return Err(persistence_message(
                operation,
                "Invalid Unit ownership or duplicate identity.",
            ));
        }
        if unit.name.trim().is_empty()
            || unit.name != unit.name.trim()
            || !names.insert(unit.name.to_lowercase())
            || !(0..=9_007_199_254_740_991).contains(&unit.price)
        {
            return Err(persistence_message(
                operation,
                "Invalid Unit name or price.",
            ));
        }
    }
    Ok(())
}

async fn fetch_product(
    pool: &SqlitePool,
    product_id: &str,
) -> Result<Option<ProductRecord>, sqlx::Error> {
    let products = fetch_products_by_query(pool, ProductQuery::Id(product_id)).await?;
    Ok(products.into_iter().next())
}

async fn fetch_products(
    pool: &SqlitePool,
    activity: Option<bool>,
) -> Result<Vec<ProductRecord>, sqlx::Error> {
    fetch_products_by_query(
        pool,
        activity.map_or(ProductQuery::All, ProductQuery::Activity),
    )
    .await
}

enum ProductQuery<'a> {
    Id(&'a str),
    Activity(bool),
    All,
}

async fn fetch_products_by_query(
    pool: &SqlitePool,
    filter: ProductQuery<'_>,
) -> Result<Vec<ProductRecord>, sqlx::Error> {
    let mut query = QueryBuilder::<Sqlite>::new(
        "SELECT
           p.id AS product_id, p.sku, p.name AS product_name, p.brand, p.category,
           p.is_active AS product_is_active, p.created_at AS product_created_at,
           p.updated_at AS product_updated_at,
           u.id AS unit_id, u.name AS unit_name, u.price,
           u.is_active AS unit_is_active, u.created_at AS unit_created_at,
           u.updated_at AS unit_updated_at
         FROM products p
         LEFT JOIN units u ON u.product_id = p.id",
    );
    match filter {
        ProductQuery::Id(product_id) => {
            query.push(" WHERE p.id = ").push_bind(product_id);
        }
        ProductQuery::Activity(is_active) => {
            query.push(" WHERE p.is_active = ").push_bind(is_active);
        }
        ProductQuery::All => {}
    }
    query.push(" ORDER BY p.name COLLATE NOCASE, p.id, u.created_at, u.id");
    let rows = query.build().fetch_all(pool).await?;

    let mut products: Vec<ProductRecord> = Vec::new();
    let mut product_indexes = HashMap::<String, usize>::new();
    for row in rows {
        let product_id: String = row.try_get("product_id")?;
        let index = if let Some(index) = product_indexes.get(&product_id) {
            *index
        } else {
            let index = products.len();
            products.push(ProductRecord {
                id: product_id.clone(),
                sku: row.try_get("sku")?,
                name: row.try_get("product_name")?,
                brand: row.try_get("brand")?,
                category: row.try_get("category")?,
                is_active: row.try_get::<i64, _>("product_is_active")? == 1,
                created_at: row.try_get("product_created_at")?,
                updated_at: row.try_get("product_updated_at")?,
                units: Vec::new(),
            });
            product_indexes.insert(product_id.clone(), index);
            index
        };

        // A corrupt Product without Units remains visible to Domain validation.
        if row.try_get::<Option<String>, _>("unit_id")?.is_none() {
            continue;
        }
        products[index].units.push(UnitRecord {
            id: row.try_get("unit_id")?,
            product_id,
            name: row.try_get("unit_name")?,
            price: row.try_get("price")?,
            is_active: row.try_get::<i64, _>("unit_is_active")? == 1,
            created_at: row.try_get("unit_created_at")?,
            updated_at: row.try_get("unit_updated_at")?,
        });
    }
    Ok(products)
}

async fn set_product_inactive(
    pool: &SqlitePool,
    product_id: &str,
    updated_at: &str,
) -> Result<(), sqlx::Error> {
    let result = sqlx::query("UPDATE products SET is_active = 0, updated_at = ? WHERE id = ?")
        .bind(updated_at)
        .bind(product_id)
        .execute(pool)
        .await?;
    if result.rows_affected() != 1 {
        return Err(sqlx::Error::RowNotFound);
    }
    Ok(())
}

fn map_write_error(operation: &str, sku: Option<&str>, error: sqlx::Error) -> ProductCommandError {
    if let sqlx::Error::Database(database_error) = &error {
        if database_error.is_unique_violation() && database_error.message().contains("products.sku")
        {
            return ProductCommandError::SkuConflict {
                sku: sku.unwrap_or_default().to_string(),
            };
        }
    }
    persistence(operation, error)
}

fn persistence(operation: &str, error: impl std::fmt::Display) -> ProductCommandError {
    eprintln!("SQLite {operation} failure: {error}");
    persistence_message(
        operation,
        &format!("Database {operation} operation failed."),
    )
}

fn persistence_message(operation: &str, message: &str) -> ProductCommandError {
    ProductCommandError::Persistence {
        operation: operation.to_string(),
        message: message.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    include!("database_regression_tests.rs");
    include!("database_benchmark.rs");

    const PRODUCT_ID: &str = "11111111-1111-4111-8111-111111111111";
    const SECOND_PRODUCT_ID: &str = "33333333-3333-4333-8333-333333333333";
    const UNIT_ID: &str = "22222222-2222-4222-8222-222222222222";
    const NOW: &str = "2026-01-01T00:00:00.000Z";

    async fn test_pool() -> SqlitePool {
        let options = connection_options()
            .in_memory(true)
            .foreign_keys(true)
            .busy_timeout(Duration::from_secs(2));
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(options)
            .await
            .unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        pool
    }

    fn product(id: &str, unit_id: &str, sku: Option<&str>) -> ProductRecord {
        ProductRecord {
            id: id.to_string(),
            sku: sku.map(str::to_string),
            name: "Coca Cola".to_string(),
            brand: None,
            category: Some("Drink".to_string()),
            is_active: true,
            created_at: NOW.to_string(),
            updated_at: NOW.to_string(),
            units: vec![UnitRecord {
                id: unit_id.to_string(),
                product_id: id.to_string(),
                name: "Can".to_string(),
                price: 10_000,
                is_active: true,
                created_at: NOW.to_string(),
                updated_at: NOW.to_string(),
            }],
        }
    }

    #[test]
    fn migration_is_safe_on_repeated_startup_and_creates_four_tables() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            sqlx::migrate!("./migrations").run(&pool).await.unwrap();

            let tables: Vec<String> = sqlx::query_scalar(
                "SELECT name FROM sqlite_master
                 WHERE type = 'table' AND name IN ('products', 'units', 'invoices', 'invoice_items')
                 ORDER BY name",
            )
            .fetch_all(&pool)
            .await
            .unwrap();

            assert_eq!(
                tables,
                vec!["invoice_items", "invoices", "products", "units"]
            );

            let foreign_keys: i64 = sqlx::query_scalar("PRAGMA foreign_keys")
                .fetch_one(&pool)
                .await
                .unwrap();
            let busy_timeout: i64 = sqlx::query_scalar("PRAGMA busy_timeout")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(foreign_keys, 1);
            assert_eq!(busy_timeout, 2_000);
        });
    }

    #[test]
    fn creates_gets_lists_updates_and_deactivates_product_with_units() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            let original = product(PRODUCT_ID, UNIT_ID, Some("SKU-1"));
            save_product(&pool, original, "create", true).await.unwrap();

            let fetched = fetch_product(&pool, PRODUCT_ID).await.unwrap().unwrap();
            assert_eq!(fetched.units.len(), 1);
            assert_eq!(fetch_products(&pool, Some(true)).await.unwrap().len(), 1);
            assert!(fetch_products(&pool, Some(false)).await.unwrap().is_empty());

            let mut updated = fetched;
            updated.name = "Coca Cola Updated".to_string();
            updated.units[0].price = 12_000;
            save_product(&pool, updated, "update", false).await.unwrap();
            let fetched = fetch_product(&pool, PRODUCT_ID).await.unwrap().unwrap();
            assert_eq!(fetched.name, "Coca Cola Updated");
            assert_eq!(fetched.units[0].price, 12_000);

            set_product_inactive(&pool, PRODUCT_ID, "2026-01-02T00:00:00.000Z")
                .await
                .unwrap();
            assert!(fetch_products(&pool, Some(true)).await.unwrap().is_empty());
            assert_eq!(fetch_products(&pool, Some(false)).await.unwrap().len(), 1);
        });
    }

    #[test]
    fn allows_duplicate_names_but_maps_case_insensitive_sku_conflict() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            save_product(
                &pool,
                product(PRODUCT_ID, UNIT_ID, Some("SKU-1")),
                "create",
                true,
            )
            .await
            .unwrap();

            let error = save_product(
                &pool,
                product(
                    SECOND_PRODUCT_ID,
                    "44444444-4444-4444-8444-444444444444",
                    Some("sku-1"),
                ),
                "create",
                true,
            )
            .await
            .unwrap_err();

            assert!(matches!(error, ProductCommandError::SkuConflict { .. }));
            assert_eq!(fetch_products(&pool, None).await.unwrap().len(), 1);

            save_product(
                &pool,
                product(
                    SECOND_PRODUCT_ID,
                    "44444444-4444-4444-8444-444444444444",
                    None,
                ),
                "create",
                true,
            )
            .await
            .unwrap();
            assert_eq!(fetch_products(&pool, None).await.unwrap().len(), 2);
        });
    }

    #[test]
    fn rolls_back_product_when_an_owned_unit_write_fails() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            let mut invalid = product(PRODUCT_ID, UNIT_ID, None);
            invalid.units[0].product_id = SECOND_PRODUCT_ID.to_string();

            let result = save_product(&pool, invalid, "create", true).await;

            assert!(result.is_err());
            let count: i64 = sqlx::query_scalar("SELECT count(*) FROM products")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(count, 0);
        });
    }
}
