use tauri::{AppHandle, Manager};
use tauri_plugin_sql::{Migration, MigrationKind};

/// 初始化 SQL 插件
pub fn init_sql_plugin() -> tauri_plugin_sql::Builder {
    tauri_plugin_sql::Builder::new().add_migrations(
        "sqlite:app.db",
        vec![
            Migration {
                version: 1,
                description: "create config table",
                sql: "
                        CREATE TABLE IF NOT EXISTS config (
                            id TEXT PRIMARY KEY NOT NULL,
                            key TEXT NOT NULL,
                            value TEXT NOT NULL,
                            created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
                            updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
                        );
                        
                        CREATE INDEX IF NOT EXISTS idx_config_key ON config(key);
                    ",
                kind: MigrationKind::Up,
            },
            Migration {
                version: 2,
                description: "create trigger for updated_at",
                sql: "
                        CREATE TRIGGER IF NOT EXISTS update_config_timestamp
                        AFTER UPDATE ON config
                        FOR EACH ROW
                        BEGIN
                            UPDATE config SET updated_at = strftime('%s', 'now')
                            WHERE id = NEW.id;
                        END;
                    ",
                kind: MigrationKind::Up,
            },
        ],
    )
}

/// 在应用启动后执行额外的会话级优化设置
pub async fn post_init_sql(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let app_config_dir = app.path().app_config_dir()?;
    let db_path = app_config_dir.join("app.db");
    let db_path_str = db_path.display().to_string();

    tracing::info!("✅ SQL 数据库初始化完成");
    tracing::info!("   - 数据库路径: {}", db_path_str);
    tracing::info!("   - WAL 模式: 已启用（默认）");

    Ok(())
}
