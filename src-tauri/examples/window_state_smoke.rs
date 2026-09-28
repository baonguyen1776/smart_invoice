//! Fresh-process checks of native window restoration using an isolated profile.
//! Run with scripts/window-state-smoke.mjs after building this example.
#[path = "../src/window_state.rs"]
mod window_state;

use std::{thread, time::Duration};
use tauri::Manager;

fn main() {
    let identifier = std::env::var("SMART_INVOICE_SMOKE_ID").expect("isolated profile required");
    assert!(
        identifier.starts_with("com.smartinvoice.smoke.window")
            && identifier
                .chars()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '.')
    );
    let phase = std::env::var("SMART_INVOICE_SMOKE_PHASE").expect("phase required");
    let mut context = tauri::generate_context!();
    context.config_mut().identifier = identifier;
    // The smoke example needs only the window, with no business data or IPC.
    context.config_mut().app.windows[0].url =
        tauri::WebviewUrl::External("about:blank".parse().unwrap());
    tauri::Builder::default()
        .setup(move |app| {
            println!(
                "WINDOW_STATE_PATH {}",
                app.path()
                    .app_config_dir()?
                    .join("window-state.txt")
                    .display()
            );
            window_state::initialize(app)?;
            let handle = app.handle().clone();
            thread::spawn(move || {
                // Native macOS fullscreen transitions are asynchronous.
                thread::sleep(Duration::from_secs(2));
                let result = check_phase(&handle, &phase);
                match result {
                    Ok(()) => {
                        println!("WINDOW_STATE_PASS {phase}");
                        handle.exit(0);
                    }
                    Err(error) => {
                        eprintln!("WINDOW_STATE_FAIL {phase}: {error}");
                        handle.exit(1);
                    }
                }
            });
            Ok(())
        })
        .on_window_event(window_state::handle_window_event)
        .build(context)
        .expect("native window smoke startup failed")
        .run(window_state::handle_app_event);
}

fn check_phase(app: &tauri::AppHandle, phase: &str) -> Result<(), Box<dyn std::error::Error>> {
    let window = app
        .get_webview_window("main")
        .ok_or("missing main window")?;
    let size = window
        .inner_size()?
        .to_logical::<f64>(window.scale_factor()?);
    let fullscreen = window.is_fullscreen()?;
    let maximized = window.is_maximized()?;
    println!(
        "WINDOW_STATE_ACTUAL {} {} maximized={maximized} fullscreen={fullscreen}",
        size.width, size.height
    );
    match phase {
        "resize" => {
            window.set_size(tauri::LogicalSize::new(1400.0, 700.0))?;
            thread::sleep(Duration::from_secs(1));
        }
        "normal" | "maximize" | "fullscreen" | "close" | "minimize" => {
            if (size.width - 1400.0).abs() > 1.0
                || (size.height - 700.0).abs() > 1.0
                || fullscreen
                || maximized
            {
                return Err("custom 10:5 normal window was not restored".into());
            }
            match phase {
                "maximize" => window.maximize()?,
                "fullscreen" => window.set_fullscreen(true)?,
                "minimize" => window.minimize()?,
                "close" => window.close()?,
                _ => {}
            }
            thread::sleep(Duration::from_secs(2));
        }
        "restore-maximized" => {
            if !maximized {
                return Err("maximized mode was not restored".into());
            }
            window.unmaximize()?;
            thread::sleep(Duration::from_secs(2));
        }
        "restore-fullscreen" => {
            if !fullscreen {
                return Err("fullscreen mode was not restored".into());
            }
            window.set_fullscreen(false)?;
            thread::sleep(Duration::from_secs(2));
        }
        "fallback" => {
            if size.width != 1280.0 || size.height != 800.0 || fullscreen || maximized {
                return Err("invalid preferences did not fall back to default".into());
            }
        }
        _ => return Err("unknown smoke phase".into()),
    }
    Ok(())
}
