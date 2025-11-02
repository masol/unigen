use git2::Repository;
use std::path::Path;

#[tauri::command]
pub fn ensure_git(path: String) -> Result<bool, String> {
    let repo_path = Path::new(&path);

    // 检查路径是否存在
    if !repo_path.exists() {
        tracing::warn!("路径不存在: {}", path);
        return Ok(false);
    }

    // 尝试打开现有的 Git 仓库
    match Repository::open(repo_path) {
        Ok(_) => {
            // Git 仓库已存在
            tracing::info!("Git 仓库已存在: {}", path);
            Ok(true)
        }
        Err(_) => {
            // Git 仓库不存在，尝试初始化
            tracing::debug!("未找到 Git 仓库，尝试初始化: {}", path);
            match Repository::init(repo_path) {
                Ok(_) => {
                    tracing::info!("成功初始化 Git 仓库: {}", path);
                    Ok(true)
                }
                Err(init_err) => {
                    tracing::error!("初始化 Git 仓库失败: {} - 错误: {}", path, init_err);
                    Ok(false)
                }
            }
        }
    }
}
