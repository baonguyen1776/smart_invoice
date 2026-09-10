mod database;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .setup(database::initialize)
        .invoke_handler(tauri::generate_handler![
            database::create_product,
            database::get_product,
            database::update_product,
            database::deactivate_product,
            database::list_products,
            database::create_invoice_draft,
            database::get_invoice,
            database::save_invoice_draft,
            database::complete_invoice,
            database::overwrite_completed_invoice,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}
