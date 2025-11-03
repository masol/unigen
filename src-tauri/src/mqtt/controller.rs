use rumqttc::{Client, Event, MqttOptions, Packet, QoS};
use serde::{Deserialize, Serialize};
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

// ============================================================================
// 常量定义
// ============================================================================

/// MQTT Broker 地址
const MQTT_BROKER_HOST: &str = "127.0.0.1";

/// MQTT Broker 端口
const MQTT_BROKER_PORT: u16 = 31883;

/// MQTT 保持活动时间（秒）
const MQTT_KEEP_ALIVE_SECS: u64 = 10;

/// MQTT 客户端队列容量
const MQTT_QUEUE_CAPACITY: usize = 10;

/// 等待 Broker 启动的延迟时间（秒）
const BROKER_STARTUP_DELAY_SECS: u64 = 2;

/// 连接错误重试延迟（秒）
const CONNECTION_ERROR_RETRY_SECS: u64 = 1;

/// 消息发送确认超时（毫秒）
const MESSAGE_SEND_TIMEOUT_MS: u64 = 10;

/// 系统命令主题
const COMMAND_TOPIC: &str = "syscommand";

/// 关闭命令动作
const ACTION_SHUTDOWN: &str = "shutdown";

/// Monitor 客户端 ID
const CLIENT_ID_MONITOR: &str = "shutdown_monitor";

/// Sender 客户端 ID
const CLIENT_ID_SENDER: &str = "shutdown_sender";

// ============================================================================
// 数据结构
// ============================================================================

/// 关闭命令结构
#[derive(Debug, Deserialize, Serialize)]
struct ShutdownCommand {
    /// 命令动作类型
    action: String,
    /// 目标进程 PID
    pid: u32,
}

// ============================================================================
// 公共函数
// ============================================================================
/// 监控关闭命令
///
/// # Arguments
/// * `shutdown_tx` - 关闭信号发送通道
///
/// # Returns
/// * `Ok(())` - 监控正常结束
/// * `Err` - 发生错误
///
/// # Example
/// no_run
/// use std::sync::mpsc;
///
/// let (tx, rx) = mpsc::channel();
/// monitor_shutdown_command(tx)?;
///
pub fn monitor_shutdown_command(
    shutdown_tx: mpsc::Sender<()>,
) -> Result<(), Box<dyn std::error::Error>> {
    thread::sleep(Duration::from_secs(BROKER_STARTUP_DELAY_SECS));

    let current_pid = std::process::id();
    println!("Current process PID: {}", current_pid);

    let unique_client_id = format!("{}_{}", CLIENT_ID_MONITOR, current_pid);

    let (client, mut connection) = create_mqtt_client(&unique_client_id)?;

    // 标记是否已订阅
    let mut subscribed = false;

    // 处理消息
    for notification in connection.iter() {
        match notification {
            Ok(Event::Incoming(Packet::ConnAck(connack))) => {
                println!("Connected to broker: {:?}", connack);
                // 连接成功后立即订阅
                if !subscribed {
                    if let Err(e) = client.subscribe(COMMAND_TOPIC, QoS::AtLeastOnce) {
                        eprintln!("Subscribe error: {}", e);
                    } else {
                        println!("Subscribing to {}", COMMAND_TOPIC);
                        subscribed = true;
                    }
                }
            }
            Ok(Event::Incoming(Packet::SubAck(suback))) => {
                println!("Subscription confirmed: {:?}", suback);
            }
            Ok(Event::Incoming(Packet::Publish(publish))) => {
                println!("Received message on topic: {}", publish.topic);
                if should_process_shutdown(&publish, current_pid, &shutdown_tx)? {
                    println!("Shutdown command received, exiting...");
                    break;
                }
            }
            Ok(Event::Outgoing(_)) => {
                // 忽略 outgoing 事件
            }
            Ok(_) => {
                // 忽略其他事件
            }
            Err(e) => {
                eprintln!("Connection error: {:?}", e);
                thread::sleep(Duration::from_secs(CONNECTION_ERROR_RETRY_SECS));
                // 连接错误后需要重置订阅标记
                subscribed = false;
            }
        }
    }

    Ok(())
}

/// 发送关闭指令到指定 PID 的进程
///
/// # Arguments
/// * `target_pid` - 目标进程的 PID
///
/// # Returns
/// * `Ok(())` - 成功发送关闭指令
/// * `Err` - 连接或发送失败
///
/// # Example
///
/// send_shutdown_command(12345)?;
///
pub fn send_shutdown_command(target_pid: u32) -> Result<(), Box<dyn std::error::Error>> {
    println!("Sending shutdown command to PID: {}", target_pid);

    let current_pid = std::process::id();
    // 使用 PID 和时间戳创建唯一的 Client ID
    let unique_client_id = format!(
        "{}_{}_{}",
        CLIENT_ID_SENDER,
        current_pid,
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)?
            .as_millis()
    );

    // 创建 MQTT 连接
    let (client, mut connection) = create_mqtt_client(&unique_client_id)?;

    // 构造并发送关闭命令
    let command = ShutdownCommand {
        action: ACTION_SHUTDOWN.to_string(),
        pid: target_pid,
    };

    publish_command(&client, &command)?;
    println!("Shutdown command published to {}", COMMAND_TOPIC);

    // 等待消息发送完成
    wait_for_message_delivery(&mut connection)?;

    Ok(())
}

// ============================================================================
// 私有辅助函数
// ============================================================================

/// 创建 MQTT 客户端和连接
///
/// # Arguments
/// * `client_id` - 客户端标识符
///
/// # Returns
/// * `Ok((Client, Connection))` - MQTT 客户端和连接
/// * `Err` - 创建失败
fn create_mqtt_client(
    client_id: &str,
) -> Result<(Client, rumqttc::Connection), Box<dyn std::error::Error>> {
    let mut mqttoptions = MqttOptions::new(client_id, MQTT_BROKER_HOST, MQTT_BROKER_PORT);

    // 启用 clean session，连接时清理之前的会话
    mqttoptions.set_clean_session(true);

    mqttoptions.set_keep_alive(Duration::from_secs(MQTT_KEEP_ALIVE_SECS));

    Ok(Client::new(mqttoptions, MQTT_QUEUE_CAPACITY))
}

/// 处理发布消息并判断是否应该关闭
///
/// # Arguments
/// * `publish` - 发布消息
/// * `current_pid` - 当前进程 PID
/// * `shutdown_tx` - 关闭信号发送通道
///
/// # Returns
/// * `Ok(true)` - 应该关闭进程
/// * `Ok(false)` - 不应该关闭进程
/// * `Err` - 处理错误
fn should_process_shutdown(
    publish: &rumqttc::Publish,
    current_pid: u32,
    shutdown_tx: &mpsc::Sender<()>,
) -> Result<bool, Box<dyn std::error::Error>> {
    // 检查主题
    if publish.topic != COMMAND_TOPIC {
        return Ok(false);
    }

    let payload = String::from_utf8_lossy(&publish.payload);
    println!("Received message on {}: {}", publish.topic, payload);

    // 处理命令
    handle_command(&payload, current_pid, shutdown_tx)
}

/// 处理接收到的命令
///
/// # Arguments
/// * `payload` - 命令负载（JSON 字符串）
/// * `current_pid` - 当前进程 PID
/// * `shutdown_tx` - 关闭信号发送通道
///
/// # Returns
/// * `Ok(true)` - 应该关闭当前进程
/// * `Ok(false)` - 忽略该命令
/// * `Err` - 处理错误
fn handle_command(
    payload: &str,
    current_pid: u32,
    shutdown_tx: &mpsc::Sender<()>,
) -> Result<bool, Box<dyn std::error::Error>> {
    // 解析 JSON
    let cmd = parse_command(payload)?;

    // 验证 PID
    if !is_pid_match(&cmd, current_pid) {
        return Ok(false);
    }

    // 处理命令动作
    process_command_action(&cmd, current_pid, shutdown_tx)
}

/// 解析命令 JSON
///
/// # Arguments
/// * `payload` - JSON 字符串
///
/// # Returns
/// * `Ok(ShutdownCommand)` - 解析成功的命令
/// * `Err` - 解析失败
fn parse_command(payload: &str) -> Result<ShutdownCommand, Box<dyn std::error::Error>> {
    serde_json::from_str::<ShutdownCommand>(payload).map_err(|e| {
        eprintln!("Failed to parse command JSON: {}", e);
        e.into()
    })
}

/// 检查 PID 是否匹配
///
/// # Arguments
/// * `cmd` - 命令
/// * `current_pid` - 当前进程 PID
///
/// # Returns
/// * `true` - PID 匹配
/// * `false` - PID 不匹配
fn is_pid_match(cmd: &ShutdownCommand, current_pid: u32) -> bool {
    if cmd.pid != current_pid {
        println!(
            "Shutdown command for PID {}, ignoring (current PID: {})",
            cmd.pid, current_pid
        );
        return false;
    }
    true
}

/// 处理命令动作
///
/// # Arguments
/// * `cmd` - 命令
/// * `current_pid` - 当前进程 PID
/// * `shutdown_tx` - 关闭信号发送通道
///
/// # Returns
/// * `Ok(true)` - 应该关闭进程
/// * `Ok(false)` - 忽略命令
/// * `Err` - 处理错误
fn process_command_action(
    cmd: &ShutdownCommand,
    current_pid: u32,
    shutdown_tx: &mpsc::Sender<()>,
) -> Result<bool, Box<dyn std::error::Error>> {
    match cmd.action.to_lowercase().as_str() {
        ACTION_SHUTDOWN => {
            println!(
                "Shutdown command received for this process (PID: {})",
                current_pid
            );
            send_shutdown_signal(shutdown_tx)?;
            Ok(true)
        }
        action => {
            println!("Unknown command action: {}", action);
            Ok(false)
        }
    }
}

/// 发送关闭信号
///
/// # Arguments
/// * `shutdown_tx` - 关闭信号发送通道
///
/// # Returns
/// * `Ok(())` - 成功发送信号
/// * `Err` - 发送失败
fn send_shutdown_signal(shutdown_tx: &mpsc::Sender<()>) -> Result<(), Box<dyn std::error::Error>> {
    shutdown_tx.send(()).map_err(|e| {
        eprintln!("Failed to send shutdown signal: {}, forcing exit", e);
        std::process::exit(0);
    })
}

/// 发布命令到 MQTT
///
/// # Arguments
/// * `client` - MQTT 客户端
/// * `command` - 关闭命令
///
/// # Returns
/// * `Ok(())` - 发布成功
/// * `Err` - 发布失败
fn publish_command(
    client: &Client,
    command: &ShutdownCommand,
) -> Result<(), Box<dyn std::error::Error>> {
    let payload = serde_json::to_string(command)?;
    client.publish(COMMAND_TOPIC, QoS::AtLeastOnce, false, payload.as_bytes())?;
    Ok(())
}

/// 等待消息发送完成
///
/// # Arguments
/// * `connection` - MQTT 连接
///
/// # Returns
/// * `Ok(())` - 消息发送成功
/// * `Err` - 发送失败或超时
fn wait_for_message_delivery(
    connection: &mut rumqttc::Connection,
) -> Result<(), Box<dyn std::error::Error>> {
    for notification in connection.iter() {
        match notification {
            Ok(rumqttc::Event::Outgoing(rumqttc::Outgoing::Publish(_))) => {
                println!("Message sent successfully");
                return Ok(());
            }
            Ok(_) => {
                // 继续处理其他事件
            }
            Err(e) => {
                return Err(format!("Connection error while sending: {}", e).into());
            }
        }

        // 添加超时保护
        thread::sleep(Duration::from_millis(MESSAGE_SEND_TIMEOUT_MS));
    }

    Err("Failed to confirm message delivery".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_shutdown_command_serialization() {
        let cmd = ShutdownCommand {
            action: ACTION_SHUTDOWN.to_string(),
            pid: 12345,
        };

        let json = serde_json::to_string(&cmd).unwrap();
        let parsed: ShutdownCommand = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.action, ACTION_SHUTDOWN);
        assert_eq!(parsed.pid, 12345);
    }

    #[test]
    fn test_parse_command_valid() {
        let json = r#"{"action":"shutdown","pid":12345}"#;
        let cmd = parse_command(json).unwrap();

        assert_eq!(cmd.action, "shutdown");
        assert_eq!(cmd.pid, 12345);
    }

    #[test]
    fn test_parse_command_invalid() {
        let json = r#"{"invalid":"json"}"#;
        assert!(parse_command(json).is_err());
    }

    #[test]
    fn test_is_pid_match() {
        let cmd = ShutdownCommand {
            action: ACTION_SHUTDOWN.to_string(),
            pid: 12345,
        };

        assert!(is_pid_match(&cmd, 12345));
        assert!(!is_pid_match(&cmd, 54321));
    }
}
