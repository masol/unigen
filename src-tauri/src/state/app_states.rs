use parking_lot::RwLock;
use std::fs::File;
use std::path::Path;
use std::sync::Arc;
use crate::utils::filelock::acquire_lock; // 确保路径正确

/// 应用状态结构体 - 内部数据
#[derive(Debug)]
struct AppStatesInner {
    initialized: bool,
    project_lock: Option<File>, // 新增：持久化项目锁
}

impl Default for AppStatesInner {
    fn default() -> Self {
        Self {
            initialized: false,
            project_lock: None,
        }
    }
}

/// 应用状态包装器 - 提供线程安全访问
#[derive(Debug, Clone)]
pub struct AppStates {
    inner: Arc<RwLock<AppStatesInner>>,
}

impl AppStates {
    /// 创建新的应用状态实例
    pub fn new() -> Self {
        Self {
            inner: Arc::new(RwLock::new(AppStatesInner::default())),
        }
    }

    /// 读操作 - 获取 initialized 状态
    #[inline]
    pub fn is_initialized(&self) -> bool {
        self.inner.read().initialized
    }

    /// 写操作 - 设置 initialized 状态
    #[inline]
    pub fn set_initialized(&self, value: bool) {
        self.inner.write().initialized = value;
    }

    /// 尝试锁定项目，成功则持久化锁句柄（自动释放旧锁）
    /// 返回是否成功获取锁
    pub fn lock_project<P: AsRef<Path>>(&self, path: P) -> bool {
        if let Some(file) = acquire_lock(path) {
            self.inner.write().project_lock = Some(file);
            true
        } else {
            false
        }
    }

    pub fn unlock_project(&self) {
        self.inner.write().project_lock = None;
    }

    // 检查当前是否已持有项目锁
    pub fn is_project_locked(&self) -> bool {
        self.inner.read().project_lock.is_some()
    }
}

impl Default for AppStates {
    fn default() -> Self {
        Self::new()
    }
}