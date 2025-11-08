mod commands;
mod mqtt;
mod state;
mod utils;

use mqtt::service::start_mqtt_service;
use state::GlobalState;
use tauri::Emitter;
use utils::appmode::AppMode;
// use utils::file_watcher;
use crate::utils::appmode::chk_and_boot_mqtt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_mode = AppMode::from_env();

    if app_mode.is_mqtt() {
        start_mqtt_service();
    } else {
        tauri::Builder::default()
            .plugin(tauri_plugin_http::init())
            .plugin(utils::sql::init_sql_plugin().build())
            .plugin(tauri_plugin_notification::init())
            .plugin(tauri_plugin_clipboard_manager::init())
            .plugin(tauri_plugin_fs::init())
            .plugin(tauri_plugin_os::init())
            .plugin(tauri_plugin_dialog::init())
            .plugin(tauri_plugin_opener::init())
            .setup(setup_app)
            .invoke_handler(register_all_commands!())
            .run(tauri::generate_context!())
            .expect("error while running tauri application");
    }
}

/// 应用初始化逻辑
fn setup_app(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    // 1. 创建全局状态
    let global_state = GlobalState::new();

    // 2. 设置全局单例（必须在 manage 之前）
    state::set_global_state(global_state).map_err(|_| "GLOBAL_STATE already initialized")?;

    // 初始化trace，此时global_state可用了．
    utils::init();
    // 3. 注册到 Tauri State（供 commands 使用）
    // 注意：这里不再 manage GlobalState，而是在 commands 中通过 GLOBAL_STATE 访问
    // 或者你可以 manage 一个轻量级的引用类型

    // let handle = app.handle().clone();
    // if let Err(e) = file_watcher::setup_config_watcher(handle) {
    //     eprintln!("Failed to setup config watcher: {}", e);
    // }

    // 4. 异步初始化
    let app_handle = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        initialize_app_async(app_handle).await;
    });

    Ok(())
}

/// 异步初始化逻辑
async fn initialize_app_async(app_handle: tauri::AppHandle) {
    let state: &GlobalState = GlobalState::get();

    // 1. 初始化 GlobalState
    if let Err(e) = state.init(&app_handle).await {
        eprintln!("❌ GlobalState 初始化失败: {}", e);
        std::process::exit(1);
    }
    tracing::info!("✅ GlobalState 初始化成功");

    // 2. SQL 后置初始化
    if let Err(e) = utils::sql::post_init_sql(&app_handle).await {
        eprintln!("❌ SQL 后置初始化失败: {}", e);
        std::process::exit(1);
    }
    tracing::info!("✅ SQL 后置初始化成功");

    // 3. 检查并启动mqtt.
    tokio::spawn(async move {
        if !chk_and_boot_mqtt() {
            tracing::warn!("无法启动mqtt服务...")
        }
    });

    // 3. 其他初始化任务
    // if let Err(e) = warm_up_cache().await {
    //     tracing::warn!("⚠️  缓存预热失败: {}", e);
    // }

    state.app_states.set_initialized(true);
    if let Err(e) = app_handle.emit("tauri//inited", ()) {
        tracing::error!("❌ 发送初始化完成事件失败: {}", e);
    }
}
