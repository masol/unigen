// pub mod store;
pub mod git;
pub mod info;
pub mod project;

#[macro_export]
macro_rules! register_all_commands {
    () => {
        tauri::generate_handler![
            crate::commands::info::get_soft_info,
            crate::commands::info::log_message,
            crate::commands::info::log_message_with_span,
            crate::commands::info::boot_mqtt,
            crate::commands::git::ensure_git,
            crate::commands::project::try_lock_project,
            crate::commands::project::lock_project,
            crate::commands::project::unlock_project,
            crate::commands::project::focus_project,
        ]
    };
}
