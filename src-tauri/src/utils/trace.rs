use crate::state::{args::Args, GlobalState};
use std::io;
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

pub fn init() -> Result<(), Box<dyn std::error::Error>> {
    let state = GlobalState::get();
    let args = &state.args;

    // 创建环境过滤器
    // 优先级：命令行参数 > 环境变量 > 默认值
    let env_filter = if let Some(filter) = args.effective_log_filter() {
        // 用户明确指定了命令行参数（--debug 或 --log-filter）
        EnvFilter::try_new(filter)?
    } else {
        // 尝试使用环境变量，否则使用默认值
        EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| EnvFilter::new(Args::default_log_filter()))
    };

    let registry = tracing_subscriber::registry().with(env_filter);

    // 判断是否需要文件和行号信息
    // 当过滤器包含 debug 或 trace 时显示详细信息
    let filter_str = args
        .effective_log_filter()
        .unwrap_or(Args::default_log_filter());
    let show_file_info = filter_str.contains("trace") || filter_str.contains("debug");

    if let Some(log_file_path) = &args.log_file {
        // 同时输出到控制台和文件
        let file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(log_file_path)?;

        // 控制台输出层
        let console_layer = fmt::layer()
            .with_target(true)
            .with_thread_ids(false)
            .with_thread_names(false)
            .with_file(show_file_info)
            .with_line_number(show_file_info)
            .with_span_events(if show_file_info {
                fmt::format::FmtSpan::CLOSE
            } else {
                fmt::format::FmtSpan::NONE
            })
            .compact()
            .with_ansi(true)
            .with_writer(io::stderr);

        // 文件输出层
        let file_layer = fmt::layer()
            .with_target(true)
            .with_thread_ids(false)
            .with_thread_names(false)
            .with_file(show_file_info)
            .with_line_number(show_file_info)
            .with_span_events(if show_file_info {
                fmt::format::FmtSpan::CLOSE
            } else {
                fmt::format::FmtSpan::NONE
            })
            .with_ansi(false)
            .with_writer(file);

        registry.with(console_layer).with(file_layer).init();
    } else {
        // 仅控制台输出
        let console_layer = fmt::layer()
            .with_target(true)
            .with_thread_ids(false)
            .with_thread_names(false)
            .with_file(show_file_info)
            .with_line_number(show_file_info)
            .with_span_events(if show_file_info {
                fmt::format::FmtSpan::CLOSE
            } else {
                fmt::format::FmtSpan::NONE
            })
            .compact()
            .with_ansi(true)
            .with_writer(io::stderr);

        registry.with(console_layer).init();
    }

    // 记录初始化信息
    tracing::info!(
        log_filter = filter_str,
        log_file = ?args.log_file,
        "Tracing initialized"
    );

    Ok(())
}
