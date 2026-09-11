//! Real Wry webview/IPC smoke test, isolated from the normal application profile.
//! Build: cargo build --release --example native_smoke --features tauri/custom-protocol
#[path = "../src/database.rs"]
mod database;

use tauri::Manager;

#[tauri::command]
fn smoke_report(app: tauri::AppHandle, success: bool, report: String) {
    println!("SMOKE_RESULT {report}");
    app.exit(if success { 0 } else { 1 });
}

fn main() {
    let identifier = std::env::var("SMART_INVOICE_SMOKE_ID").expect("isolated profile required");
    assert!(
        identifier.starts_with("com.smartinvoice.smoke.")
            && identifier
                .chars()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '.')
    );
    let phase = std::env::var("SMART_INVOICE_SMOKE_PHASE").expect("phase required");
    assert!(phase == "write" || phase == "reopen");
    let mut context = tauri::generate_context!();
    context.config_mut().identifier = identifier;
    context.config_mut().app.windows.clear();
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            database::create_product,
            database::get_product,
            database::update_product,
            database::deactivate_product,
            database::list_products,
            database::create_product_alias,
            database::remove_product_alias,
            database::list_active_product_aliases,
            database::create_invoice_draft,
            database::get_invoice,
            database::save_invoice_draft,
            database::complete_invoice,
            database::overwrite_completed_invoice,
            database::list_invoices,
            database::delete_invoice_draft,
            smoke_report,
        ])
        .setup(move |app| {
            let started = std::time::Instant::now();
            database::initialize(app)?;
            println!(
                "SMOKE_INIT_MS {:.3}",
                started.elapsed().as_secs_f64() * 1000.0
            );
            println!("SMOKE_DATA_DIR {}", app.path().app_data_dir()?.display());
            let script = format!(
                "window.SMOKE_PHASE = '{phase}';\n{}",
                include_str!("native_smoke.js")
            );
            tauri::WebviewWindowBuilder::new(
                app,
                "main",
                tauri::WebviewUrl::App("index.html".into()),
            )
            .title("Smart Invoice — isolated IPC smoke test")
            .initialization_script(script)
            .build()?;
            Ok(())
        })
        .run(context)
        .expect("native smoke startup failed");
}
