#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod lan;

use lan::LanState;
use serde::Serialize;
use tauri::{AppHandle, State, Window};

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

#[tauri::command]
async fn fe_lan_host(
    app: AppHandle,
    state: State<'_, LanState>,
    host_name: String,
) -> Result<lan::HostInfo, String> {
    lan::start_host(app, &state, host_name).await
}

#[tauri::command]
async fn fe_lan_join(
    app: AppHandle,
    state: State<'_, LanState>,
    target: String,
) -> Result<lan::HostInfo, String> {
    lan::join_host(app, &state, target).await
}

#[tauri::command]
async fn fe_lan_send(
    state: State<'_, LanState>,
    key: String,
    msg: serde_json::Value,
) -> Result<(), String> {
    lan::send_to_peer(&state, &key, msg).await
}

#[tauri::command]
async fn fe_lan_leave(state: State<'_, LanState>) -> Result<(), String> {
    lan::stop_all(&state).await;
    Ok(())
}

#[tauri::command]
async fn fe_lan_discover(timeout_ms: Option<u64>) -> Vec<serde_json::Value> {
    lan::discover_hosts(timeout_ms.unwrap_or(350)).await
}

fn main() {
    tauri::Builder::default()
        .manage(LanState::default())
        .invoke_handler(tauri::generate_handler![
            fe_win_minimize,
            fe_win_toggle_fullscreen,
            fe_get_info,
            fe_decode_lan_code,
            fe_lan_host,
            fe_lan_join,
            fe_lan_send,
            fe_lan_leave,
            fe_lan_discover,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Fatal Error Tauri application");
}
