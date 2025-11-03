use fs2::FileExt;
use std::fs::{File, OpenOptions};
use std::io::{Read, Write};
use std::path::Path;

/// 尝试在指定路径上获取文件锁，成功返回 File（RAII 锁持有者），失败返回 None
fn acquire_lock<P: AsRef<Path>>(path: P) -> Option<File> {
    let path = path.as_ref();

    let mut file = match OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .open(path)
    {
        Ok(file) => file,
        Err(e) => {
            eprintln!("无法创建或打开锁文件 {:?}: {}", path, e);
            return None;
        }
    };

    if let Err(_e) = file.try_lock_exclusive() {
        return None;
    }

    let pid = std::process::id();
    if let Err(e) = file.set_len(0) {
        eprintln!("清空锁文件失败: {}", e);
        return None;
    }
    if let Err(e) = writeln!(file, "{}", pid) {
        eprintln!("写入 PID 失败: {}", e);
        return None;
    }
    if let Err(e) = file.sync_all() {
        eprintln!("同步锁文件失败: {}", e);
    }

    Some(file)
}

/// 只读打开锁文件并读取其中的 PID
/// 成功返回 PID，失败返回 0
fn read_lock_pid<P: AsRef<Path>>(path: P) -> u32 {
    let path = path.as_ref();

    // 只读方式打开文件
    let mut file = match File::open(path) {
        Ok(file) => file,
        Err(_) => return 0,
    };

    // 读取文件内容
    let mut content = String::new();
    if file.read_to_string(&mut content).is_err() {
        return 0;
    }

    // 解析 PID（去除空白字符后解析）
    content.trim().parse::<u32>().unwrap_or(0)
}

/// 获取 MQTT 服务专用的锁，使用默认锁文件路径
pub fn acquire_mqtt_lock() -> Option<std::fs::File> {
    let lock_path = std::env::temp_dir().join("unigen-mqtt-service.lock");
    acquire_lock(&lock_path)
}

pub fn read_mqtt_pid() -> u32 {
    let lock_path = std::env::temp_dir().join("unigen-mqtt-service.lock");
    read_lock_pid(&lock_path)
}

/// 检查 MQTT 服务是否已经在运行
/// - 返回 `true`：表示已有实例在运行
/// - 返回 `false`：表示当前没有实例运行（可启动）
pub fn mqtt_is_running() -> bool {
    match acquire_mqtt_lock() {
        Some(file) => {
            // 成功拿到锁 → 说明没有其他实例在运行
            // 但我们只是检查，所以要立即释放锁
            if let Err(e) = file.unlock() {
                eprintln!("警告：释放检查锁失败: {}", e);
            }
            false // 没有运行
        }
        None => {
            // 拿不到锁 → 说明另一个实例正在运行
            true // 正在运行
        }
    }
}
