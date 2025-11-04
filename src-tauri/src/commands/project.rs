use crate::state::GlobalState;
use crate::utils::filelock::acquire_lock;
use std::path::{Path, PathBuf};

/// 构造项目锁文件路径: {proj_path}/ugmeta/unigen.pid
fn project_lock_file_path(proj_path: &str) -> PathBuf {
    Path::new(proj_path).join("ugmeta").join("unigen.pid")
}

#[tauri::command]
pub fn try_lock_project(path: String) -> Result<bool, String> {
    let lock_path = project_lock_file_path(&path);
    Ok(acquire_lock(lock_path).is_some())
}

#[tauri::command]
pub fn lock_project(path: String) -> Result<bool, String> {
    let lock_path = project_lock_file_path(&path);
    let state = GlobalState::get();
    Ok(state.app_states.lock_project(lock_path))
}

#[tauri::command]
pub fn unlock_project() -> Result<bool, String> {
    let state = GlobalState::get();
    let has_lock = state.app_states.is_project_locked();
    if has_lock {
        state.app_states.unlock_project();
    }
    Ok(has_lock)
}

#[tauri::command]
pub async fn focus_project() -> Result<bool, String> {
    let state = GlobalState::get();
    let window = state
        .app_handle
        .get_main_window()
        .await
        .map_err(|e| format!("获取窗口失败: {}", e))?;

    tracing::info!("强制聚焦窗口");

    // 组合拳
    let _ = window.unminimize();
    let _ = window.show();

    // 先置顶
    let _ = window.set_always_on_top(true);

    // 请求用户注意（会让任务栏图标闪烁或弹跳）
    #[cfg(target_os = "windows")]
    let _ = window.request_user_attention(Some(tauri::UserAttentionType::Critical));

    #[cfg(target_os = "macos")]
    let _ = window.request_user_attention(Some(tauri::UserAttentionType::Critical));

    let _ = window.set_focus();

    // 延迟后取消置顶
    tokio::spawn(async move {
        tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
        let _ = window.set_always_on_top(false);
    });

    Ok(true)
}
