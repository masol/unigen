use crate::state::GlobalState;

/// 触发配置变更信号的通用函数
///
/// 通知配置文件监听器配置已发生变更，
/// 不执行实际的数据库操作，仅用于信号通知。
fn touch_config<F>(action: F, action_desc: &str) -> Result<(), String>
where
    F: FnOnce(&GlobalState) -> std::io::Result<()>,
{
    let state = GlobalState::get();
    action(state).map_err(|e| format!("触发{}配置通知失败: {}", action_desc, e))?;

    tracing::debug!("📢 {}配置变更信号已触发", action_desc);
    Ok(())
}

/// 触发数据库配置变更信号
///
/// 通知配置文件监听器数据库配置已发生变更
// pub fn touch_db_config() -> Result<(), String> {
//     touch_config(|state| state.app_states.touch_config_file(), "数据库")
// }

/// 触发窗口焦点配置变更信号
///
/// 通知配置文件监听器窗口焦点已发生变更
// pub fn touch_focus_config(pid: u32) -> Result<(), String> {
//     touch_config(|state| state.app_states.write_focus_action(pid), "焦点")
// }

/// Tauri Command: 触发数据库配置变更信号
///
/// 用于前端在完成数据库操作后，通知其它进程重新加载配置(如果有)
#[tauri::command]
pub fn emit_cfg_changed() -> Result<(), String> {
    // touch_db_config()
    Ok(())
}

/// Tauri Command: 触发窗口焦点变更信号
/// 用于前端通知系统窗口焦点已变更到指定进程
#[tauri::command]
pub fn emit_focus(_pid: u32) -> Result<bool, String> {
    Ok(false)
}
