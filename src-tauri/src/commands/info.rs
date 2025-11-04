// src/commands/info.rs
use crate::{state::GlobalState, utils::appmode::chk_and_boot_mqtt};
use serde::Serialize;
use tracing::{debug, error, info, trace, warn};

#[derive(Serialize)]
pub struct PkgInfoResponse {
    pub version: String,
    pub initialized: bool,
    pub locale: String,
    pub prjarg: String, // 命令行传入的项目目录，空表示未传入．
    pub pid: u32,
}

#[tauri::command]
pub async fn get_soft_info() -> Result<PkgInfoResponse, String> {
    let state = GlobalState::get();

    Ok(PkgInfoResponse {
        version: env!("CARGO_PKG_VERSION").to_string(),
        initialized: state.app_states.is_initialized(),
        locale: sys_locale::get_locale().unwrap_or_else(|| "en".into()),
        prjarg: state
            .args
            .project
            .as_ref()
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_default(),
        pid: std::process::id(),
    })
}

#[tauri::command]
pub fn boot_mqtt() -> Result<bool, String> {
    Ok(chk_and_boot_mqtt())
}

#[tauri::command]
pub fn log_message(level: String, message: String) {
    match level.to_lowercase().as_str() {
        "trace" => trace!("{}", message),
        "debug" => debug!("{}", message),
        "info" => info!("{}", message),
        "warn" => warn!("{}", message),
        "error" => error!("{}", message),
        _ => warn!("Unknown log level: {}, message: {}", level, message),
    }
}

// span 跟踪
#[tauri::command]
pub fn log_message_with_span(level: String, message: String, span_name: String) {
    let span = tracing::info_span!("frontend", name = %span_name);
    let _enter = span.enter();

    match level.to_lowercase().as_str() {
        "trace" => trace!("{}", message),
        "debug" => debug!("{}", message),
        "info" => info!("{}", message),
        "warn" => warn!("{}", message),
        "error" => error!("{}", message),
        _ => warn!("Unknown log level: {}, message: {}", level, message),
    }
}
