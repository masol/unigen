pub mod store;
pub mod info;
pub mod git;

#[macro_export]
macro_rules! register_all_commands {
    () => {
        tauri::generate_handler![
            crate::commands::info::get_soft_info,
            crate::commands::info::log_message,
            crate::commands::info::log_message_with_span,
            crate::commands::store::emit_cfg_changed,
            crate::commands::store::emit_focus,
            crate::commands::store::is_pid_valid,
            crate::commands::git::ensure_git,
        ]
    };
}
