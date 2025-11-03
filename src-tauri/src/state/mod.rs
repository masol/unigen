pub mod app_handle;
pub mod app_states;
pub mod args;

use self::app_handle::AppHandleState;
use self::app_states::AppStates;
// use notify::RecommendedWatcher;
// use notify_debouncer_full::{Debouncer, NoCache};  // 改为 NoCache
// use std::sync::Mutex;
use std::sync::OnceLock;

/// 全局状态结构体
///
/// # 线程安全
/// - `GlobalState` 本身通过 `OnceLock<GlobalState>` 保证只初始化一次
/// - 所有成员必须实现 `Send + Sync` 以支持跨线程访问
/// - 每个成员负责管理自己的内部可变性（通过 Mutex/RwLock/AtomicXxx 等）
#[derive(Debug)]
pub struct GlobalState {
    /// AppHandle 状态（内部使用 OnceCell 管理）
    pub app_handle: AppHandleState,

    /// 应用状态（内部使用 AtomicBool/RwLock 等管理）
    pub app_states: AppStates,

    /// 命令行参数（不可变，天然线程安全）
    pub args: args::Args,
    // 文件监听器（使用 Mutex 保护可变访问，设置为None会停止监听－－可以重新调用setup_config_watcher再次监听．）
    // pub config_watcher: Mutex<Option<Debouncer<RecommendedWatcher, NoCache>>>,  // 改为 NoCache
    // 其他字段示例：
    // pub db: Arc<DbPool>,           // Arc 包装的数据库连接池
    // pub config: RwLock<Config>,    // RwLock 保护的可变配置
}

/// 全局单例访问点
static GLOBAL_STATE: OnceLock<GlobalState> = OnceLock::new();

// 显式声明线程安全（编译器会验证所有成员都是 Send + Sync）
// 如果任何成员不满足条件，编译会失败
unsafe impl Send for GlobalState {}
unsafe impl Sync for GlobalState {}

impl GlobalState {
    /// 创建全局状态（仅构造，不初始化）
    pub fn new() -> Self {
        let args = args::Args::new();

        // 处理 kill 命令（如果设置了 --kill，这里会直接退出进程）
        args.handle_kill_if_requested();

        // 如果执行到这里，说明没有设置 --kill，继续正常初始化
        Self {
            app_handle: AppHandleState::new(),
            args,
            app_states: AppStates::new(),
            // config_watcher: Mutex::new(None),
        }
    }

    /// 异步初始化所有组件
    pub async fn init(&self, handle: &tauri::AppHandle) -> Result<(), String> {
        tokio::try_join!(
            self.app_handle.init(handle.clone()),
            // 其他初始化任务
        )?;

        Ok(())
    }

    /// 获取全局单例（panic 如果未初始化）
    pub fn get() -> &'static GlobalState {
        GLOBAL_STATE
            .get()
            .expect("GlobalState 未初始化，请确保在 setup 中正确初始化")
    }

    /*
    /// 安全获取全局单例
    pub fn try_get() -> Option<&'static GlobalState> {
        GLOBAL_STATE.get()
    }

    /// 设置文件监听器（线程安全）
    pub fn set_debouncer(&self, debouncer: Debouncer<RecommendedWatcher, notify_debouncer_full::FileIdMap>) {
        let mut guard = self.debouncer.lock().unwrap();
        *guard = Some(debouncer);
    }

    /// 获取文件监听器的引用（需要持有锁）
    pub fn with_debouncer<F, R>(&self, f: F) -> Option<R>
    where
        F: FnOnce(&mut Debouncer<RecommendedWatcher, notify_debouncer_full::FileIdMap>) -> R,
    {
        let mut guard = self.debouncer.lock().unwrap();
        guard.as_mut().map(f)
    }
     */
}

/// 设置全局状态（仅在 setup 时调用一次）
pub(crate) fn set_global_state(state: GlobalState) -> Result<(), GlobalState> {
    GLOBAL_STATE.set(state)
}

impl Default for GlobalState {
    fn default() -> Self {
        Self::new()
    }
}
