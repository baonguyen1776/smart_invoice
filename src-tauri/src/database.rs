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

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductAliasRecord {
    pub id: String,
    pub product_id: String,
    pub alias: String,
    pub normalized_alias: String,
    pub source_key: Option<String>,
    pub source_name_raw: Option<String>,
    pub unit_name: Option<String>,
    pub created_at: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InvoiceItemRecord {
    pub id: String,
    pub invoice_id: String,
    pub product_id: String,
    pub unit_id: String,
    pub product_name: String,
    pub product_sku: Option<String>,
    pub product_brand: Option<String>,
    pub unit_name: String,
    pub unit_price: i64,
    pub quantity: i64,
    pub subtotal: i64,
    pub discount_basis_points: i64,
    pub created_at: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InvoiceRecord {
    pub id: String,
    pub invoice_number: i64,
    pub status: String,
    pub total: i64,
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,

    pub items: Vec<InvoiceItemRecord>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateInvoiceDraftInput {
    pub id: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum InvoiceCommandError {
    Persistence { operation: String, message: String },
}

#[derive(Debug, Serialize)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum ProductCommandError {
    SkuConflict { sku: String },
    AliasConflict { alias: String },
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

#[tauri::command]
pub async fn create_product_alias(
    state: State<'_, DatabaseState>,
    alias: ProductAliasRecord,
) -> Result<(), ProductCommandError> {
    insert_product_alias(&state.0, alias).await
}

#[tauri::command]
pub async fn remove_product_alias(
    state: State<'_, DatabaseState>,
    alias_id: String,
) -> Result<(), ProductCommandError> {
    delete_product_alias(&state.0, &alias_id)
        .await
        .map_err(|error| persistence("remove_alias", error))
}

#[tauri::command]
pub async fn list_active_product_aliases(
    state: State<'_, DatabaseState>,
) -> Result<Vec<ProductAliasRecord>, ProductCommandError> {
    fetch_active_product_aliases(&state.0)
        .await
        .map_err(|error| persistence("list_aliases", error))
}

#[tauri::command]
pub async fn create_invoice_draft(
    state: State<'_, DatabaseState>,
    input: CreateInvoiceDraftInput,
) -> Result<InvoiceRecord, InvoiceCommandError> {
    insert_invoice_draft(&state.0, input)
        .await
        .map_err(|error| invoice_persistence("create_draft", error))
}

#[tauri::command]
pub async fn get_invoice(
    state: State<'_, DatabaseState>,
    invoice_id: String,
) -> Result<Option<InvoiceRecord>, InvoiceCommandError> {
    fetch_invoice(&state.0, &invoice_id)
        .await
        .map_err(|error| invoice_persistence("get", error))
}

#[tauri::command]
pub async fn save_invoice_draft(
    state: State<'_, DatabaseState>,
    invoice: InvoiceRecord,
) -> Result<(), InvoiceCommandError> {
    persist_draft_items_and_total(&state.0, invoice)
        .await
        .map_err(|error| invoice_persistence("save_draft", error))
}

#[tauri::command]
pub async fn complete_invoice(
    state: State<'_, DatabaseState>,
    invoice: InvoiceRecord,
) -> Result<(), InvoiceCommandError> {
    persist_completed_invoice(&state.0, invoice)
        .await
        .map_err(|error| invoice_persistence("complete", error))
}

#[tauri::command]
pub async fn overwrite_completed_invoice(
    state: State<'_, DatabaseState>,
    invoice: InvoiceRecord,
) -> Result<(), InvoiceCommandError> {
    persist_overwrite_completed(&state.0, invoice)
        .await
        .map_err(|error| invoice_persistence("overwrite_completed", error))
}

#[tauri::command]
pub async fn list_invoices(
    state: State<'_, DatabaseState>,
    status: Option<String>,
) -> Result<Vec<InvoiceRecord>, InvoiceCommandError> {
    fetch_invoices(&state.0, status.as_deref())
        .await
        .map_err(|error| invoice_persistence("list", error))
}

#[tauri::command]
pub async fn delete_invoice_draft(
    state: State<'_, DatabaseState>,
    id: String,
) -> Result<(), InvoiceCommandError> {
    delete_draft(&state.0, &id)
        .await
        .map_err(|error| invoice_persistence("delete_draft", error))
}

const MAX_SAFE_INTEGER: i64 = 9_007_199_254_740_991;

fn is_uuid_v4(s: &str) -> bool {
    let bytes = s.as_bytes();
    if bytes.len() != 36 {
        return false;
    }
    for (i, &b) in bytes.iter().enumerate() {
        match i {
            8 | 13 | 18 | 23 => {
                if b != b'-' {
                    return false;
                }
            }
            14 => {
                if b != b'4' {
                    return false;
                }
            }
            19 => {
                if !matches!(b, b'8' | b'9' | b'a' | b'b' | b'A' | b'B') {
                    return false;
                }
            }
            _ => {
                if !b.is_ascii_hexdigit() {
                    return false;
                }
            }
        }
    }
    true
}

fn is_canonical_iso8601_utc(s: &str) -> bool {
    let b = s.as_bytes();
    if b.len() != 24 {
        return false;
    }
    if b[4] != b'-'
        || b[7] != b'-'
        || b[10] != b'T'
        || b[13] != b':'
        || b[16] != b':'
        || b[19] != b'.'
        || b[23] != b'Z'
    {
        return false;
    }
    let digits_indices = [0, 1, 2, 3, 5, 6, 8, 9, 11, 12, 14, 15, 17, 18, 20, 21, 22];
    for &idx in &digits_indices {
        if !b[idx].is_ascii_digit() {
            return false;
        }
    }
    let parse2 =
        |start: usize| -> u32 { (b[start] - b'0') as u32 * 10 + (b[start + 1] - b'0') as u32 };
    let year = ((b[0] - b'0') as u32 * 1_000)
        + ((b[1] - b'0') as u32 * 100)
        + ((b[2] - b'0') as u32 * 10)
        + (b[3] - b'0') as u32;
    let month = parse2(5);
    let day = parse2(8);
    let hour = parse2(11);
    let minute = parse2(14);
    let second = parse2(17);

    if !(1..=12).contains(&month) || hour > 23 || minute > 59 || second > 59 {
        return false;
    }

    let days_in_month = match month {
        2 if year.is_multiple_of(400) || (year.is_multiple_of(4) && !year.is_multiple_of(100)) => {
            29
        }
        2 => 28,
        4 | 6 | 9 | 11 => 30,
        _ => 31,
    };
    (1..=days_in_month).contains(&day)
}

fn validate_invoice_timestamps(invoice: &InvoiceRecord) -> Result<(), sqlx::Error> {
    let valid_header_timestamps = is_canonical_iso8601_utc(&invoice.created_at)
        && is_canonical_iso8601_utc(&invoice.updated_at)
        && invoice
            .completed_at
            .as_deref()
            .is_none_or(is_canonical_iso8601_utc);
    let valid_item_timestamps = invoice
        .items
        .iter()
        .all(|item| is_canonical_iso8601_utc(&item.created_at));

    if !valid_header_timestamps || !valid_item_timestamps {
        return Err(sqlx::Error::Protocol(
            "Invoice timestamps must be canonical ISO-8601 UTC values.".into(),
        ));
    }
    Ok(())
}

fn calculate_and_validate_total(
    items: &[InvoiceItemRecord],
    supplied_total: i64,
) -> Result<i64, sqlx::Error> {
    let mut total: i64 = 0;
    let mut gross: i64 = 0;
    for item in items {
        if item.subtotal < 0 || item.subtotal > MAX_SAFE_INTEGER {
            return Err(sqlx::Error::Protocol(
                "Item subtotal out of safe integer range.".into(),
            ));
        }
        let calculated_subtotal = item
            .unit_price
            .checked_mul(item.quantity)
            .ok_or_else(|| sqlx::Error::Protocol("Item subtotal arithmetic overflow.".into()))?;
        if calculated_subtotal != item.subtotal {
            return Err(sqlx::Error::Protocol(
                "Item subtotal does not match unit_price * quantity.".into(),
            ));
        }
        if !(0..=10_000).contains(&item.discount_basis_points) {
            return Err(sqlx::Error::Protocol(
                "Invalid discount basis points.".into(),
            ));
        }
        let discount = ((i128::from(item.subtotal) * i128::from(item.discount_basis_points)
            + 5_000)
            / 10_000) as i64;
        gross = gross
            .checked_add(item.subtotal)
            .ok_or_else(|| sqlx::Error::Protocol("Invoice gross amount overflow.".into()))?;
        if gross > MAX_SAFE_INTEGER {
            return Err(sqlx::Error::Protocol(
                "Invoice gross amount exceeds safe integer limit.".into(),
            ));
        }
        total = total
            .checked_add(item.subtotal - discount)
            .ok_or_else(|| sqlx::Error::Protocol("Invoice total arithmetic overflow.".into()))?;
        if total > MAX_SAFE_INTEGER {
            return Err(sqlx::Error::Protocol(
                "Invoice total exceeds safe integer limit.".into(),
            ));
        }
    }
    if total != supplied_total {
        return Err(sqlx::Error::Protocol(
            "Supplied invoice total does not match calculated total.".into(),
        ));
    }
    Ok(total)
}

async fn validate_item_ownership_and_insert(
    transaction: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    invoice_id: &str,
    item: &InvoiceItemRecord,
) -> Result<(), sqlx::Error> {
    let owned_product_id: Option<String> =
        sqlx::query_scalar("SELECT product_id FROM units WHERE id = ?")
            .bind(&item.unit_id)
            .fetch_optional(&mut **transaction)
            .await?;

    let Some(product_id) = owned_product_id else {
        return Err(sqlx::Error::Protocol(format!(
            "Unit {} not found.",
            item.unit_id
        )));
    };

    if product_id != item.product_id {
        return Err(sqlx::Error::Protocol(format!(
            "Unit {} does not belong to Product {}.",
            item.unit_id, item.product_id
        )));
    }

    sqlx::query(
        "INSERT INTO invoice_items
         (id, invoice_id, product_id, unit_id, product_name, product_sku, product_brand,
          unit_name, unit_price, quantity, subtotal, discount_basis_points, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&item.id)
    .bind(invoice_id)
    .bind(&item.product_id)
    .bind(&item.unit_id)
    .bind(&item.product_name)
    .bind(&item.product_sku)
    .bind(&item.product_brand)
    .bind(&item.unit_name)
    .bind(item.unit_price)
    .bind(item.quantity)
    .bind(item.subtotal)
    .bind(item.discount_basis_points)
    .bind(&item.created_at)
    .execute(&mut **transaction)
    .await?;

    Ok(())
}

async fn insert_invoice_draft(
    pool: &SqlitePool,
    input: CreateInvoiceDraftInput,
) -> Result<InvoiceRecord, sqlx::Error> {
    if !is_uuid_v4(&input.id) {
        return Err(sqlx::Error::Protocol("id must be a valid UUID v4.".into()));
    }
    if !is_canonical_iso8601_utc(&input.created_at) {
        return Err(sqlx::Error::Protocol(
            "created_at must be a canonical ISO-8601 UTC timestamp.".into(),
        ));
    }

    let mut transaction = pool.begin_with("BEGIN IMMEDIATE").await?;
    let next_number: i64 =
        sqlx::query_scalar("SELECT COALESCE(MAX(invoice_number), 0) + 1 FROM invoices")
            .fetch_one(&mut *transaction)
            .await?;

    sqlx::query(
        "INSERT INTO invoices (id, invoice_number, status, total, created_at, updated_at, completed_at)
         VALUES (?, ?, 'draft', 0, ?, ?, NULL)",
    )
    .bind(&input.id)
    .bind(next_number)
    .bind(&input.created_at)
    .bind(&input.created_at)
    .execute(&mut *transaction)
    .await?;

    transaction.commit().await?;

    Ok(InvoiceRecord {
        id: input.id,
        invoice_number: next_number,
        status: "draft".to_string(),
        total: 0,
        created_at: input.created_at.clone(),
        updated_at: input.created_at,
        completed_at: None,
        items: Vec::new(),
    })
}

async fn fetch_invoice(
    pool: &SqlitePool,
    invoice_id: &str,
) -> Result<Option<InvoiceRecord>, sqlx::Error> {
    let mut transaction = pool.begin().await?;

    let invoice_row = sqlx::query(
        "SELECT id, invoice_number, status, total, created_at, updated_at, completed_at
         FROM invoices WHERE id = ?",
    )
    .bind(invoice_id)
    .fetch_optional(&mut *transaction)
    .await?;

    let Some(row) = invoice_row else {
        transaction.commit().await?;
        return Ok(None);
    };

    let item_rows = sqlx::query(
        "SELECT id, invoice_id, product_id, unit_id, product_name, product_sku, product_brand,
                unit_name, unit_price, quantity, subtotal, discount_basis_points, created_at
         FROM invoice_items
         WHERE invoice_id = ?
         ORDER BY created_at ASC, id ASC",
    )
    .bind(invoice_id)
    .fetch_all(&mut *transaction)
    .await?;

    transaction.commit().await?;

    let mut items = Vec::with_capacity(item_rows.len());
    for item_row in item_rows {
        items.push(InvoiceItemRecord {
            id: item_row.try_get("id")?,
            invoice_id: item_row.try_get("invoice_id")?,
            product_id: item_row.try_get("product_id")?,
            unit_id: item_row.try_get("unit_id")?,
            product_name: item_row.try_get("product_name")?,
            product_sku: item_row.try_get("product_sku")?,
            product_brand: item_row.try_get("product_brand")?,
            unit_name: item_row.try_get("unit_name")?,
            unit_price: item_row.try_get("unit_price")?,
            quantity: item_row.try_get("quantity")?,
            subtotal: item_row.try_get("subtotal")?,
            discount_basis_points: item_row.try_get("discount_basis_points")?,
            created_at: item_row.try_get("created_at")?,
        });
    }

    Ok(Some(InvoiceRecord {
        id: row.try_get("id")?,
        invoice_number: row.try_get("invoice_number")?,
        status: row.try_get("status")?,
        total: row.try_get("total")?,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
        completed_at: row.try_get("completed_at")?,
        items,
    }))
}

async fn fetch_invoices(
    pool: &SqlitePool,
    status: Option<&str>,
) -> Result<Vec<InvoiceRecord>, sqlx::Error> {
    let mut transaction = pool.begin().await?;

    let invoice_rows = if let Some(st) = status {
        sqlx::query(
            "SELECT id, invoice_number, status, total, created_at, updated_at, completed_at
             FROM invoices WHERE status = ?
             ORDER BY updated_at DESC, invoice_number DESC",
        )
        .bind(st)
        .fetch_all(&mut *transaction)
        .await?
    } else {
        sqlx::query(
            "SELECT id, invoice_number, status, total, created_at, updated_at, completed_at
             FROM invoices
             ORDER BY updated_at DESC, invoice_number DESC",
        )
        .fetch_all(&mut *transaction)
        .await?
    };

    let mut invoices = Vec::with_capacity(invoice_rows.len());

    for row in invoice_rows {
        let invoice_id: String = row.try_get("id")?;
        let item_rows = sqlx::query(
            "SELECT id, invoice_id, product_id, unit_id, product_name, product_sku, product_brand,
                    unit_name, unit_price, quantity, subtotal, discount_basis_points, created_at
             FROM invoice_items
             WHERE invoice_id = ?
             ORDER BY created_at ASC, id ASC",
        )
        .bind(&invoice_id)
        .fetch_all(&mut *transaction)
        .await?;

        let mut items = Vec::with_capacity(item_rows.len());
        for item_row in item_rows {
            items.push(InvoiceItemRecord {
                id: item_row.try_get("id")?,
                invoice_id: item_row.try_get("invoice_id")?,
                product_id: item_row.try_get("product_id")?,
                unit_id: item_row.try_get("unit_id")?,
                product_name: item_row.try_get("product_name")?,
                product_sku: item_row.try_get("product_sku")?,
                product_brand: item_row.try_get("product_brand")?,
                unit_name: item_row.try_get("unit_name")?,
                unit_price: item_row.try_get("unit_price")?,
                quantity: item_row.try_get("quantity")?,
                subtotal: item_row.try_get("subtotal")?,
                discount_basis_points: item_row.try_get("discount_basis_points")?,
                created_at: item_row.try_get("created_at")?,
            });
        }

        invoices.push(InvoiceRecord {
            id: invoice_id,
            invoice_number: row.try_get("invoice_number")?,
            status: row.try_get("status")?,
            total: row.try_get("total")?,
            created_at: row.try_get("created_at")?,
            updated_at: row.try_get("updated_at")?,
            completed_at: row.try_get("completed_at")?,
            items,
        });
    }

    transaction.commit().await?;
    Ok(invoices)
}

async fn delete_draft(pool: &SqlitePool, invoice_id: &str) -> Result<(), sqlx::Error> {
    let mut transaction = pool.begin_with("BEGIN IMMEDIATE").await?;
    sqlx::query("DELETE FROM invoice_items WHERE invoice_id = ?")
        .bind(invoice_id)
        .execute(&mut *transaction)
        .await?;
    sqlx::query("DELETE FROM invoices WHERE id = ? AND status = 'draft'")
        .bind(invoice_id)
        .execute(&mut *transaction)
        .await?;
    transaction.commit().await?;
    Ok(())
}

async fn persist_draft_items_and_total(
    pool: &SqlitePool,
    invoice: InvoiceRecord,
) -> Result<(), sqlx::Error> {
    if invoice.status != "draft" {
        return Err(sqlx::Error::Protocol(
            "Invoice status must be draft.".into(),
        ));
    }
    validate_invoice_timestamps(&invoice)?;
    let calculated_total = calculate_and_validate_total(&invoice.items, invoice.total)?;
    let mut transaction = pool.begin_with("BEGIN IMMEDIATE").await?;

    let update_result = sqlx::query(
        "UPDATE invoices
         SET total = ?, updated_at = ?
         WHERE id = ? AND status = 'draft'",
    )
    .bind(calculated_total)
    .bind(&invoice.updated_at)
    .bind(&invoice.id)
    .execute(&mut *transaction)
    .await?;

    if update_result.rows_affected() != 1 {
        return Err(sqlx::Error::RowNotFound);
    }

    sqlx::query("DELETE FROM invoice_items WHERE invoice_id = ?")
        .bind(&invoice.id)
        .execute(&mut *transaction)
        .await?;

    for item in &invoice.items {
        validate_item_ownership_and_insert(&mut transaction, &invoice.id, item).await?;
    }

    transaction.commit().await?;
    Ok(())
}

async fn persist_completed_invoice(
    pool: &SqlitePool,
    invoice: InvoiceRecord,
) -> Result<(), sqlx::Error> {
    if invoice.status != "completed" || invoice.completed_at.is_none() || invoice.items.is_empty() {
        return Err(sqlx::Error::Protocol(
            "Completing an invoice requires completed status, completed_at, and at least one item."
                .into(),
        ));
    }
    validate_invoice_timestamps(&invoice)?;
    let calculated_total = calculate_and_validate_total(&invoice.items, invoice.total)?;
    let completed_at = invoice.completed_at.as_deref().unwrap();
    let mut transaction = pool.begin_with("BEGIN IMMEDIATE").await?;

    let update_result = sqlx::query(
        "UPDATE invoices
         SET status = 'completed', total = ?, updated_at = ?, completed_at = ?
         WHERE id = ? AND status = 'draft'",
    )
    .bind(calculated_total)
    .bind(&invoice.updated_at)
    .bind(completed_at)
    .bind(&invoice.id)
    .execute(&mut *transaction)
    .await?;

    if update_result.rows_affected() != 1 {
        return Err(sqlx::Error::RowNotFound);
    }

    sqlx::query("DELETE FROM invoice_items WHERE invoice_id = ?")
        .bind(&invoice.id)
        .execute(&mut *transaction)
        .await?;

    for item in &invoice.items {
        validate_item_ownership_and_insert(&mut transaction, &invoice.id, item).await?;
    }

    transaction.commit().await?;
    Ok(())
}

async fn persist_overwrite_completed(
    pool: &SqlitePool,
    invoice: InvoiceRecord,
) -> Result<(), sqlx::Error> {
    if invoice.status != "completed" || invoice.items.is_empty() {
        return Err(sqlx::Error::Protocol(
            "Overwriting a completed invoice requires completed status and at least one item."
                .into(),
        ));
    }
    validate_invoice_timestamps(&invoice)?;
    let calculated_total = calculate_and_validate_total(&invoice.items, invoice.total)?;
    let mut transaction = pool.begin_with("BEGIN IMMEDIATE").await?;

    let existing_row = sqlx::query(
        "SELECT invoice_number, created_at, completed_at FROM invoices WHERE id = ? AND status = 'completed'",
    )
    .bind(&invoice.id)
    .fetch_optional(&mut *transaction)
    .await?;

    let Some(row) = existing_row else {
        return Err(sqlx::Error::RowNotFound);
    };

    let existing_number: i64 = row.try_get("invoice_number")?;
    let existing_created_at: String = row.try_get("created_at")?;
    let existing_completed_at: Option<String> = row.try_get("completed_at")?;

    if existing_number != invoice.invoice_number
        || existing_created_at != invoice.created_at
        || existing_completed_at != invoice.completed_at
    {
        return Err(sqlx::Error::Protocol(
            "Immutable fields (invoice_number, created_at, completed_at) cannot be modified during overwrite.".into(),
        ));
    }

    let update_result = sqlx::query(
        "UPDATE invoices
         SET total = ?, updated_at = ?
         WHERE id = ? AND status = 'completed'",
    )
    .bind(calculated_total)
    .bind(&invoice.updated_at)
    .bind(&invoice.id)
    .execute(&mut *transaction)
    .await?;

    if update_result.rows_affected() != 1 {
        return Err(sqlx::Error::RowNotFound);
    }

    sqlx::query("DELETE FROM invoice_items WHERE invoice_id = ?")
        .bind(&invoice.id)
        .execute(&mut *transaction)
        .await?;

    for item in &invoice.items {
        validate_item_ownership_and_insert(&mut transaction, &invoice.id, item).await?;
    }

    transaction.commit().await?;
    Ok(())
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

fn validate_product_alias(alias: &ProductAliasRecord) -> Result<(), ProductCommandError> {
    let optional_values_are_valid = [&alias.source_key, &alias.source_name_raw, &alias.unit_name]
        .into_iter()
        .all(|value| {
            value
                .as_deref()
                .is_none_or(|text| !text.trim().is_empty() && text == text.trim())
        });

    if !is_uuid_v4(&alias.id)
        || !is_uuid_v4(&alias.product_id)
        || alias.alias.trim().is_empty()
        || alias.alias != alias.alias.trim()
        || alias.normalized_alias.trim().is_empty()
        || alias.normalized_alias != alias.normalized_alias.trim()
        || !optional_values_are_valid
        || (alias.source_key.is_none() && alias.source_name_raw.is_some())
        || !is_canonical_iso8601_utc(&alias.created_at)
    {
        return Err(persistence_message(
            "create_alias",
            "Invalid ProductAlias contract.",
        ));
    }

    Ok(())
}

async fn insert_product_alias(
    pool: &SqlitePool,
    alias: ProductAliasRecord,
) -> Result<(), ProductCommandError> {
    validate_product_alias(&alias)?;
    let result = sqlx::query(
        "INSERT INTO product_aliases
         (id, product_id, alias, normalized_alias, source_key, source_name_raw, unit_name, created_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?
         WHERE EXISTS (SELECT 1 FROM products WHERE id = ? AND is_active = 1)",
    )
    .bind(&alias.id)
    .bind(&alias.product_id)
    .bind(&alias.alias)
    .bind(&alias.normalized_alias)
    .bind(&alias.source_key)
    .bind(&alias.source_name_raw)
    .bind(&alias.unit_name)
    .bind(&alias.created_at)
    .bind(&alias.product_id)
    .execute(pool)
    .await
    .map_err(|error| map_alias_write_error(&alias.alias, error))?;

    if result.rows_affected() != 1 {
        return Err(persistence_message(
            "create_alias",
            "ProductAlias requires an active Product.",
        ));
    }
    Ok(())
}

async fn delete_product_alias(pool: &SqlitePool, alias_id: &str) -> Result<(), sqlx::Error> {
    if !is_uuid_v4(alias_id) {
        return Err(sqlx::Error::Protocol(
            "alias_id must be a valid UUID v4.".into(),
        ));
    }
    let result = sqlx::query("DELETE FROM product_aliases WHERE id = ?")
        .bind(alias_id)
        .execute(pool)
        .await?;
    if result.rows_affected() != 1 {
        return Err(sqlx::Error::RowNotFound);
    }
    Ok(())
}

async fn fetch_active_product_aliases(
    pool: &SqlitePool,
) -> Result<Vec<ProductAliasRecord>, sqlx::Error> {
    let rows = sqlx::query(
        "SELECT a.id, a.product_id, a.alias, a.normalized_alias, a.source_key,
                a.source_name_raw, a.unit_name, a.created_at
         FROM product_aliases a
         INNER JOIN products p ON p.id = a.product_id
         WHERE p.is_active = 1
         ORDER BY a.created_at, a.id",
    )
    .fetch_all(pool)
    .await?;

    rows.into_iter()
        .map(|row| {
            Ok(ProductAliasRecord {
                id: row.try_get("id")?,
                product_id: row.try_get("product_id")?,
                alias: row.try_get("alias")?,
                normalized_alias: row.try_get("normalized_alias")?,
                source_key: row.try_get("source_key")?,
                source_name_raw: row.try_get("source_name_raw")?,
                unit_name: row.try_get("unit_name")?,
                created_at: row.try_get("created_at")?,
            })
        })
        .collect()
}

fn map_alias_write_error(alias: &str, error: sqlx::Error) -> ProductCommandError {
    if let sqlx::Error::Database(database_error) = &error {
        if database_error.is_unique_violation()
            && database_error
                .message()
                .contains("product_aliases.product_id")
        {
            return ProductCommandError::AliasConflict {
                alias: alias.to_string(),
            };
        }
    }
    persistence("create_alias", error)
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

fn invoice_persistence(operation: &str, error: impl std::fmt::Display) -> InvoiceCommandError {
    eprintln! {"SQLite invoice {operation} failure: {error}"}
    InvoiceCommandError::Persistence {
        operation: operation.to_string(),
        message: format! {"Database {operation} operation failed."},
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
