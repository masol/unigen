use crate::mqtt::controller::monitor_shutdown_command;
use crate::utils::filelock::acquire_mqtt_lock;
use rumqttd::{Broker, Config};
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

pub fn start_mqtt_broker() -> Result<(), Box<dyn std::error::Error>> {
    // 创建基本配置
    let config = create_mqtt_config();

    println!("MQTT Broker starting on:");
    println!("  - TCP V4: 127.0.0.1:31883");
    println!("  - TCP V5: 127.0.0.1:31884");
    println!("  - WebSocket: ws://127.0.0.1:38286");

    // 创建 broker
    let mut broker = Broker::new(config);

    // 先启动 broker
    let _broker_handle = thread::spawn(move || broker.start());

    // 等待 broker 完全启动
    thread::sleep(Duration::from_secs(2)); // 给 broker 足够的启动时间
    println!("MQTT Broker should be ready now");

    // 创建通道用于接收关闭信号
    let (shutdown_tx, shutdown_rx) = mpsc::channel();

    // 现在启动命令监听线程
    thread::spawn(move || {
        if let Err(e) = monitor_shutdown_command(shutdown_tx) {
            eprintln!("Shutdown monitor error: {}", e);
        }
    });

    // 等待关闭信号
    match shutdown_rx.recv() {
        Ok(_) => {
            println!("Received shutdown command, stopping broker...");
        }
        Err(e) => {
            eprintln!("Shutdown channel error: {}", e);
        }
    }

    // 给 broker 一些时间清理
    thread::sleep(Duration::from_millis(500));

    Ok(())
}

fn create_mqtt_config() -> Config {
    let config_str = r#"
# Broker ID
id = 0

# 路由器设置（必需）
[router]
instant_ack = false
max_segment_size = 104857600
max_segment_count = 10
max_connections = 1001
max_outgoing_packet_count = 200

# MQTT v4 服务器 - 端口 31883
[v4.1]
name = "mqtt-v4-server"
listen = "127.0.0.1:31883"
next_connection_delay_ms = 1

[v4.1.connections]
connection_timeout_ms = 60000
max_client_id_len = 256
max_payload_size = 268435455
max_inflight_count = 500
dynamic_filters = true

# MQTT v5 TCP 服务器配置
[v5.1]
name = "mqtt-tcp-server"
listen = "127.0.0.1:31884"
next_connection_delay_ms = 1

[v5.1.connections]
connection_timeout_ms = 60000
max_client_id_len = 256
max_payload_size = 268435455
max_inflight_count = 500
max_inflight_size = 1024
dynamic_filters = true

# WebSocket 服务器配置
[ws.1]
name = "mqtt-ws-server"
listen = "127.0.0.1:38286"
next_connection_delay_ms = 1

[ws.1.connections]
connection_timeout_ms = 60000
max_client_id_len = 256
throttle_delay_ms = 0
max_payload_size = 268435455
max_inflight_count = 500
max_inflight_size = 1024
"#;

    toml::from_str(config_str).expect("Failed to parse MQTT config")
}

/// 启动 MQTT 服务
/// - 成功获取锁并进入循环 → 返回 true
/// - 获取锁失败 → 返回 false
pub fn start_mqtt_service() {
    let _file = match acquire_mqtt_lock() {
        Some(file) => file,
        None => {
            println!("未能获取锁，MQTT 服务已启动，退出中。");
            return;
        }
    };

    // 成功获取锁，开始服务
    println!("MQTT 服务启动...");
    if let Err(e) = start_mqtt_broker() {
        eprintln!("❌ MQTT Broker 启动失败: {}", e);
    }
}
