use std::sync::Arc;
use tauri::{AppHandle, Manager, WebviewWindow};
use tokio::sync::Mutex;

#[derive(Clone, Debug)]
pub struct AppHandleState {
    inner: Arc<Mutex<Option<AppHandle>>>,
}

impl AppHandleState {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::const_new(None)),
        }
    }

    /// 初始化 AppHandle（只能调用一次）
    pub async fn init(&self, handle: AppHandle) -> Result<(), String> {
        let mut guard = self.inner.lock().await;
        if guard.is_some() {
            return Err("AppHandle 已初始化".to_string());
        }
        *guard = Some(handle);
        Ok(())
    }

    /// 获取指定名称的 WebviewWindow（默认为 "main"）
    pub async fn get_window(&self, label: impl AsRef<str>) -> Result<WebviewWindow, String> {
        let guard = self.inner.lock().await;
        match &*guard {
            Some(app_handle) => app_handle
                .get_webview_window(label.as_ref())
                .ok_or_else(|| format!("窗口 '{}' 不存在", label.as_ref())),
            None => Err("AppHandle 尚未初始化".to_string()),
        }
    }

    /// 快捷方法：获取主窗口（label = "main"）
    pub async fn get_main_window(&self) -> Result<WebviewWindow, String> {
        self.get_window("main").await
    }
}

impl Default for AppHandleState {
    fn default() -> Self {
        Self::new()
    }
}
