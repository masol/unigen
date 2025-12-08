/// 环境变量的 KEY 名称
pub const ENV_APP_MODE_KEY: &str = "UNIGEN_APP_MODE";

/// 环境变量的合法取值：MQTT 模式
pub const APP_MODE_MQTT: &str = "mqtt";

/// 应用运行模式枚举（推荐用于复杂逻辑）
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AppMode {
    Mqtt,
    Desktop,
}

impl AppMode {
    /// 从环境变量解析当前模式
    pub fn from_env() -> Self {
        match std::env::var(ENV_APP_MODE_KEY).unwrap_or_default().as_str() {
            APP_MODE_MQTT => AppMode::Mqtt,
            _ => AppMode::Desktop,
        }
    }

    /// 判断是否为 MQTT 模式
    pub fn is_mqtt(&self) -> bool {
        matches!(self, AppMode::Mqtt)
    }
}

use crate::utils::filelock::mqtt_is_running;
use std::env;
use std::fs::OpenOptions;
use std::process::{Command, Stdio};

/// 启动 MQTT 服务进程
/// 如果已经运行，返回 true；否则尝试启动并返回是否成功
pub fn chk_and_boot_mqtt() -> bool {
    // 1. 检查是否已经在运行
    if mqtt_is_running() {
        tracing::info!("MQTT 服务已在运行");
        return true;
    }

    // 2. 获取当前可执行文件路径
    let current_exe = match env::current_exe() {
        Ok(path) => path,
        Err(e) => {
            tracing::error!("无法获取当前可执行文件路径: {}", e);
            return false;
        }
    };

    // 3. 准备日志文件路径（可选）
    let log_file = std::env::temp_dir().join("unigen_mqtt.log");

    // 4. 构建命令
    let mut cmd = Command::new(&current_exe);

    // 设置环境变量
    cmd.env("UNIGEN_APP_MODE", "mqtt");

    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;

        unsafe {
            cmd.pre_exec(|| {
                // 创建新会话，脱离控制终端
                if libc::setsid() == -1 {
                    return Err(std::io::Error::last_os_error());
                }

                // 改变工作目录到根目录，避免占用挂载点
                if libc::chdir(b"/\0".as_ptr() as *const libc::c_char) == -1 {
                    return Err(std::io::Error::last_os_error());
                }

                // 重置信号处理器（可选）
                // 这样子进程不会继承父进程的信号处理

                Ok(())
            });
        }

        // Unix 下重定向到日志文件或 /dev/null
        cmd.stdin(Stdio::null());

        // 选项 1: 重定向到日志文件
        match OpenOptions::new().create(true).append(true).open(&log_file) {
            Ok(file) => {
                cmd.stdout(Stdio::from(file.try_clone().unwrap()))
                    .stderr(Stdio::from(file));
                tracing::info!("MQTT 服务日志将写入: {:?}", log_file);
            }
            Err(_) => {
                // 选项 2: 如果无法创建日志文件，重定向到 /dev/null
                cmd.stdout(Stdio::null()).stderr(Stdio::null());
            }
        }
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;

        // Windows 下使用 CREATE_NO_WINDOW 和 DETACHED_PROCESS
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        const DETACHED_PROCESS: u32 = 0x00000008;

        cmd.creation_flags(CREATE_NO_WINDOW | DETACHED_PROCESS);

        // Windows 下也可以重定向到日志文件
        cmd.stdin(Stdio::null());

        match OpenOptions::new().create(true).append(true).open(&log_file) {
            Ok(file) => {
                cmd.stdout(Stdio::from(file.try_clone().unwrap()))
                    .stderr(Stdio::from(file));
                tracing::info!("MQTT 服务日志将写入: {:?}", log_file);
            }
            Err(_) => {
                cmd.stdout(Stdio::null()).stderr(Stdio::null());
            }
        }
    }

    // 5. 启动子进程
    match cmd.spawn() {
        Ok(child) => {
            let pid = child.id();
            tracing::info!("MQTT 服务已启动，进程 ID: {}", pid);

            // forget child 以实现完全分离
            // 子进程会被 init/systemd 接管（Unix）或继续独立运行（Windows）
            std::mem::forget(child);

            // 可选：短暂等待确认子进程启动成功
            std::thread::sleep(std::time::Duration::from_millis(1000));

            // 再次检查是否真的启动成功
            if mqtt_is_running() {
                tracing::info!("MQTT 服务启动确认成功");
                true
            } else {
                tracing::warn!("MQTT 服务可能启动失败，请检查日志");
                false
            }
        }
        Err(e) => {
            tracing::error!("启动 MQTT 进程失败: {}", e);
            false
        }
    }
}
