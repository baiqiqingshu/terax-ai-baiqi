// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn panic_log_path() -> std::path::PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join("app.crynta.aterax")
        .join("logs")
        .join("startup-panic.log")
}

fn install_panic_hook() {
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |panic_info| {
        let payload = panic_info
            .payload()
            .downcast_ref::<&str>()
            .map(|message| (*message).to_owned())
            .or_else(|| panic_info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "non-string panic payload".to_owned());
        let location = panic_info
            .location()
            .map(|location| format!("{}:{}:{}", location.file(), location.line(), location.column()))
            .unwrap_or_else(|| "unknown location".to_owned());
        let report = format!("Aterax startup panic\nmessage: {payload}\nlocation: {location}\n");
        let path = panic_log_path();
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = std::fs::write(path, report);
        default_hook(panic_info);
    }));
}

#[cfg(windows)]
fn show_startup_failure() {
    use windows_sys::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR, MB_OK};

    let message: Vec<u16> = "Aterax could not start.\n\nThe crash details were saved to:\n%LOCALAPPDATA%\\app.crynta.aterax\\logs\\startup-panic.log"
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();
    let title: Vec<u16> = "Aterax startup error"
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();
    unsafe {
        MessageBoxW(0, message.as_ptr(), title.as_ptr(), MB_ICONERROR | MB_OK);
    }
}

fn main() {
    install_panic_hook();
    let result = std::panic::catch_unwind(|| {
        #[cfg(target_os = "macos")]
        {
            // Disable macOS press-and-hold character popup, so key repeat works in terminal.
            use objc2::msg_send;
            use objc2_foundation::{ns_string, NSUserDefaults};
            unsafe {
                let defaults = NSUserDefaults::standardUserDefaults();
                let key = ns_string!("ApplePressAndHoldEnabled");
                let _: () = msg_send![&defaults, setBool: false, forKey: key];
            }
        }

        terax_lib::run()
    });
    if result.is_err() {
        #[cfg(windows)]
        show_startup_failure();
    }
}
