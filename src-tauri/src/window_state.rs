//! Desktop preferences are separate from the invoice database.
use std::{fs, io, path::Path, path::PathBuf, sync::Mutex};
use tauri::{Manager, Window, WindowEvent};

#[derive(Clone, Copy, Debug, PartialEq)]
struct WindowState {
    width: f64,
    height: f64,
    maximized: bool,
    fullscreen: bool,
}

impl WindowState {
    fn decode(text: &str) -> Option<Self> {
        let fields: Vec<_> = text.split_whitespace().collect();
        if fields.len() != 5 || fields[0] != "v1" {
            return None;
        }
        let state = Self {
            width: fields[1].parse().ok()?,
            height: fields[2].parse().ok()?,
            maximized: fields[3].parse().ok()?,
            fullscreen: fields[4].parse().ok()?,
        };
        (state.width.is_finite()
            && state.height.is_finite()
            && state.width > 0.0
            && state.height > 0.0)
            .then_some(state)
    }

    fn encode(self) -> String {
        format!(
            "v1 {} {} {} {}\n",
            self.width, self.height, self.maximized, self.fullscreen
        )
    }

    fn observe(
        &mut self,
        width: f64,
        height: f64,
        maximized: bool,
        fullscreen: bool,
        minimized: bool,
    ) {
        // Minimizing must never replace the last usable geometry or display mode.
        if minimized {
            return;
        }
        self.fullscreen = fullscreen;
        // Some platforms report maximized=false while in native fullscreen.
        if !fullscreen {
            self.maximized = maximized;
        }
        if !maximized && !fullscreen && width > 0.0 && height > 0.0 {
            self.width = width;
            self.height = height;
        }
    }
}

struct SavedWindowState {
    path: PathBuf,
    state: Mutex<WindowState>,
}

fn read_state(path: &Path) -> io::Result<Option<WindowState>> {
    match fs::read_to_string(path) {
        Ok(text) => WindowState::decode(&text)
            .map(Some)
            .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "invalid window state")),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error),
    }
}

fn write_state(path: &Path, state: WindowState) -> io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let temporary = path.with_extension("tmp");
    fs::write(&temporary, state.encode())?;
    fs::rename(temporary, path)
}

pub fn initialize(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let mut config = app.config().app.windows[0].clone();
    let path = app.path().app_config_dir()?.join("window-state.txt");
    let mut state = WindowState {
        width: config.width,
        height: config.height,
        maximized: config.maximized,
        fullscreen: config.fullscreen,
    };
    match read_state(&path) {
        Ok(Some(saved)) => state = saved,
        Ok(None) => {}
        Err(error) => eprintln!("Could not restore window preferences: {error}"),
    }
    // Logical dimensions preserve the apparent size across monitor DPI changes.
    config.width = state.width.max(config.min_width.unwrap_or(0.0));
    config.height = state.height.max(config.min_height.unwrap_or(0.0));
    config.maximized = false;
    config.fullscreen = false;
    config.visible = false;
    let window = tauri::WebviewWindowBuilder::from_config(app, &config)?.build()?;
    // Apply size explicitly: on macOS the builder can round the content height by a pixel.
    window.set_size(tauri::LogicalSize::new(config.width, config.height))?;
    window.center()?;
    app.manage(SavedWindowState {
        path,
        state: Mutex::new(state),
    });
    window.show()?;
    // Native display modes must be applied to the created window. In particular,
    // macOS can size an initially-maximized window without marking it as zoomed.
    if state.maximized {
        window.maximize()?;
    }
    if state.fullscreen {
        window.set_fullscreen(true)?;
    }
    Ok(())
}

fn capture(window: &Window, should_save: bool) -> Result<(), Box<dyn std::error::Error>> {
    if window.label() != "main" {
        return Ok(());
    }
    let Some(saved) = window.try_state::<SavedWindowState>() else {
        return Ok(());
    };
    let minimized = window.is_minimized()?;
    let maximized = window.is_maximized()?;
    let fullscreen = window.is_fullscreen()?;
    let size = window
        .inner_size()?
        .to_logical::<f64>(window.scale_factor()?);
    let mut state = saved
        .state
        .lock()
        .map_err(|_| "window state lock poisoned")?;
    state.observe(size.width, size.height, maximized, fullscreen, minimized);
    if should_save {
        write_state(&saved.path, *state)?;
    }
    Ok(())
}

pub fn handle_window_event(window: &Window, event: &WindowEvent) {
    let should_save = matches!(
        event,
        WindowEvent::CloseRequested { .. } | WindowEvent::Focused(false)
    );
    if should_save
        || matches!(
            event,
            WindowEvent::Resized(_) | WindowEvent::ScaleFactorChanged { .. }
        )
    {
        if let Err(error) = capture(window, should_save) {
            eprintln!("Could not save window preferences: {error}");
        }
    }
}

pub fn handle_app_event(app: &tauri::AppHandle, event: tauri::RunEvent) {
    // Cmd+Q and OS quit do not necessarily send CloseRequested to the window.
    if matches!(event, tauri::RunEvent::ExitRequested { .. }) {
        if let Some(window) = app.get_webview_window("main") {
            if let Err(error) = capture(&window.as_ref().window(), true) {
                eprintln!("Could not save window preferences on exit: {error}");
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn normal_state() -> WindowState {
        WindowState {
            width: 1400.0,
            height: 700.0,
            maximized: false,
            fullscreen: false,
        }
    }

    #[test]
    fn round_trips_custom_aspect_ratio_and_display_modes() {
        for maximized in [false, true] {
            for fullscreen in [false, true] {
                let state = WindowState {
                    maximized,
                    fullscreen,
                    ..normal_state()
                };
                assert_eq!(WindowState::decode(&state.encode()), Some(state));
            }
        }
    }

    #[test]
    fn fullscreen_and_minimize_preserve_normal_geometry() {
        let mut state = normal_state();
        state.observe(1920.0, 1080.0, true, false, false);
        assert!(state.maximized);
        state.observe(1920.0, 1080.0, false, true, false);
        assert!(state.fullscreen && state.maximized);
        state.observe(0.0, 0.0, false, false, true);
        assert!(state.fullscreen && state.maximized);
        assert_eq!((state.width, state.height), (1400.0, 700.0));
        state.observe(1400.0, 700.0, false, false, false);
        assert_eq!(state, normal_state());
        state.observe(1200.0, 800.0, false, false, false);
        assert_eq!((state.width, state.height), (1200.0, 800.0));
    }

    #[test]
    fn rejects_invalid_or_future_preferences() {
        for text in [
            "",
            "v2 1400 700 false false",
            "v1 NaN 700 false false",
            "v1 1400 inf false false",
            "v1 0 700 false false",
            "v1 -1 700 false false",
            "v1 1400 700 yes false",
            "v1 1400 700 false false extra",
        ] {
            assert!(WindowState::decode(text).is_none(), "{text}");
        }
    }

    #[test]
    fn preferences_survive_reopening_and_replacing_the_file() {
        let path = std::env::temp_dir().join(format!(
            "smart-invoice-window-test-{}.txt",
            std::process::id()
        ));
        assert_eq!(read_state(&path).unwrap(), None);
        write_state(&path, normal_state()).unwrap();
        assert_eq!(read_state(&path).unwrap(), Some(normal_state()));
        let fullscreen = WindowState {
            fullscreen: true,
            ..normal_state()
        };
        write_state(&path, fullscreen).unwrap();
        assert_eq!(read_state(&path).unwrap(), Some(fullscreen));
        fs::write(&path, "broken").unwrap();
        assert_eq!(
            read_state(&path).unwrap_err().kind(),
            io::ErrorKind::InvalidData
        );
        fs::remove_file(path).unwrap();
    }
}
