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
pub fn touch_db_config() -> Result<(), String> {
    touch_config(|state| state.app_states.touch_config_file(), "数据库")
}

/// 触发窗口焦点配置变更信号
///
/// 通知配置文件监听器窗口焦点已发生变更
pub fn touch_focus_config(pid: u32) -> Result<(), String> {
    touch_config(|state| state.app_states.write_focus_action(pid), "焦点")
}

/// Tauri Command: 触发数据库配置变更信号
///
/// 用于前端在完成数据库操作后，通知其它进程重新加载配置(如果有)
#[tauri::command]
pub fn emit_cfg_changed() -> Result<(), String> {
    touch_db_config()
}

/// Tauri Command: 触发窗口焦点变更信号
/// 用于前端通知系统窗口焦点已变更到指定进程
#[tauri::command]
pub fn emit_focus(pid: u32) -> Result<bool, String> {
    if !validate_pid(pid) {
        return Ok(false);
    }

    match touch_focus_config(pid) {
        Ok(_) => Ok(true),
        Err(_) => Ok(false),
    }
}

/// Tauri Command: 检查进程ID是否有效
/// 用于前端验证进程ID的有效性
#[tauri::command]
pub fn is_pid_valid(pid: u32) -> Result<bool, String> {
    Ok(validate_pid(pid))
}

use std::env;
use sysinfo::{Pid, System};
// 判断给定的pid是否对应一个有效的unigen.cc程序(与当前版本使用相同路径启动)．
fn validate_pid(pid: u32) -> bool {
    // 创建系统信息对象
    let mut sys = System::new_all();
    sys.refresh_all();

    // 获取当前进程的可执行文件路径
    let current_exe = match env::current_exe() {
        Ok(exe) => exe,
        Err(_) => return false,
    };

    // 在 Windows 上可能需要规范化路径（处理大小写）
    let current_exe = current_exe.canonicalize().unwrap_or(current_exe);

    // 获取目标进程的信息
    let process = match sys.process(Pid::from_u32(pid)) {
        Some(proc) => proc,
        None => return false,
    };

    // 获取目标进程的可执行文件路径
    let target_exe = match process.exe() {
        Some(exe) => exe,
        None => return false,
    };

    // 规范化目标路径
    let target_exe_canonical = target_exe
        .canonicalize()
        .unwrap_or_else(|_| target_exe.to_path_buf());

    // 比较路径
    target_exe_canonical == current_exe
}
