#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod lan;

use serde::Serialize;
use tauri::Window;

#[derive(Serialize)]
struct AppInfo {
    version: &'static str,
    runtime: &'static str,
}

#[tauri::command]
fn fe_win_minimize(window: Window) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
fn fe_win_toggle_fullscreen(window: Window) -> Result<bool, String> {
    let is_fs = window.is_fullscreen().map_err(|e| e.to_string())?;
    window.set_fullscreen(!is_fs).map_err(|e| e.to_string())?;
    Ok(!is_fs)
}

#[tauri::command]
fn fe_get_info() -> AppInfo {
    AppInfo {
        version: env!("CARGO_PKG_VERSION"),
        runtime: "tauri-rust",
    }
}

#[tauri::command]
fn fe_decode_lan_code(code: String) -> Option<(String, u16)> {
    lan::decode_lan_code(&code).map(|(ip, port)| (ip.to_string(), port))
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            fe_win_minimize,
            fe_win_toggle_fullscreen,
            fe_get_info,
            fe_decode_lan_code,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Fatal Error Tauri application");
}

