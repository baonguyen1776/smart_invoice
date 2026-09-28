mod database;
mod window_state;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .setup(|app| {
            database::initialize(app)?;
            window_state::initialize(app)
        })
        .on_window_event(window_state::handle_window_event)
        .invoke_handler(tauri::generate_handler![
            database::create_product,
            database::get_product,
            database::update_product,
            database::import_products,
            database::deactivate_product,
            database::reactivate_product,
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
            database::mark_invoice_printed,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Tauri application")
        .run(window_state::handle_app_event);
}
