use parking_lot::RwLock;
// use std::path::PathBuf;
use std::sync::Arc;

// use crate::utils::message::{ConfigAction, ConfigMessage};

/// 应用状态结构体 - 内部数据
#[derive(Debug)]
struct AppStatesInner {
    initialized: bool,
    // 配置文件监听路径（初始化后只读）
    // config_watch_path: Option<PathBuf>,
}

impl Default for AppStatesInner {
    fn default() -> Self {
        Self {
            initialized: false,
            // config_watch_path: None,
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

    // /// 设置配置文件监听路径（仅初始化时调用一次）
    // pub fn set_config_watch_path(&self, path: PathBuf) {
    //     let mut guard = self.inner.write();
    //     guard.config_watch_path = Some(path);
    // }

    // /// 获取配置文件监听路径（只读访问）
    // pub fn get_config_watch_path(&self) -> Option<PathBuf> {
    //     self.inner.read().config_watch_path.clone()
    // }

    // /// Touch 配置文件以触发文件监听事件（跨平台安全）
    // pub fn touch_config_file(&self) -> std::io::Result<()> {
    //     let path = self.get_config_watch_path().ok_or_else(|| {
    //         std::io::Error::new(std::io::ErrorKind::NotFound, "配置文件路径尚未初始化")
    //     })?;

    //     // use filetime::{set_file_mtime, FileTime};
    //     // let now = FileTime::now();
    //     // set_file_mtime(&path, now)?;
    //     // tracing::debug!("已触发配置文件 touch: {:?}", path);

    //     //由于filetime::set_file_mtime 在某些平台可能触发数据修改事件，因此这里直接将文件内容清空．
    //     // 写入空内容（内部会自动 truncate）
    //     std::fs::write(&path, b"")?;
    //     tracing::debug!("已清空配置文件: {:?}", path);

    //     Ok(())
    // }

    // 写入配置操作到文件（自动添加时间戳）
    // pub fn write_config_action(&self, action: ConfigAction) -> std::io::Result<()> {
    //     let path = self.get_config_watch_path().ok_or_else(|| {
    //         std::io::Error::new(std::io::ErrorKind::NotFound, "配置文件路径尚未初始化")
    //     })?;

    //     let message = ConfigMessage::new(action);
    //     message.write_to_file(&path)?;

    //     tracing::debug!(
    //         "已写入配置操作到文件: {:?}, 时间戳: {}",
    //         path,
    //         message.ctime
    //     );
    //     Ok(())
    // }

    // 便捷方法：写入 focus 操作
    // pub fn write_focus_action(&self, pid: u32) -> std::io::Result<()> {
    //     self.write_config_action(ConfigAction::focus(pid))
    // }

    // 读取并验证配置消息
    // pub fn read_config_message(
    //     &self,
    //     max_age_secs: Option<u64>,
    // ) -> std::io::Result<Option<ConfigMessage>> {
    //     let path = self.get_config_watch_path().ok_or_else(|| {
    //         std::io::Error::new(std::io::ErrorKind::NotFound, "配置文件路径尚未初始化")
    //     })?;

    //     ConfigMessage::read_and_validate(&path, max_age_secs)
    // }
}

impl Default for AppStates {
    fn default() -> Self {
        Self::new()
    }
}
