use clap::Parser;
use std::fs;
use std::path::PathBuf;
use std::process;
use tempfile::NamedTempFile;
use crate::utils::filelock::read_mqtt_pid;
use crate::mqtt::controller::send_shutdown_command;

#[derive(Parser, Debug, Clone)]
#[command(
    name = env!("CARGO_PKG_NAME"),
    version = env!("CARGO_PKG_VERSION"),
    about = env!("CARGO_PKG_DESCRIPTION"),
    long_about = r#"Unigen is a generative task planning and execution tool for everyday users. Humans curate and maintain workflows, while the computer executes them, enabling the automation of complex tasks such as writing and programming."#
)]
pub struct Args {
    /// Project directory path
    ///
    /// If specified, opens this directory directly.
    #[arg(value_parser = parse_writable_dir)]
    pub project: Option<PathBuf>,

    /// Enable debug mode (sets log filter to DEBUG)
    #[arg(short, long)]
    pub debug: bool,

    /// Log filter directives
    ///
    /// Supports EnvFilter syntax for fine-grained control.
    /// Examples:
    ///   - 'debug' - set all to DEBUG level
    ///   - 'debug,sqlx::query=off' - DEBUG for all, disable sqlx::query
    ///   - 'info,my_crate=debug' - INFO for all, DEBUG for my_crate
    ///
    /// Defaults to 'debug' in debug builds and 'warn' in release builds.
    /// Overridden by --debug flag (sets to 'debug').
    /// Can also be set via RUST_LOG environment variable.
    #[arg(short = 'f', long = "log-filter", value_name = "FILTER")]
    pub log_filter: Option<String>,

    /// Log file path
    ///
    /// If not specified, logs only to terminal.
    #[arg(
        long = "log-file",
        value_name = "FILE",
        value_parser = parse_log_file_path
    )]
    pub log_file: Option<PathBuf>,

    /// Send shutdown command to running unigen MQTT instance and exit
    ///
    /// Reads the PID from the lock file and sends a shutdown command
    /// to the running instance, then exits without starting the main program.
    #[arg(short, long)]
    pub kill: bool,
}

impl Args {
    /// Create Args by parsing command-line arguments
    pub fn new() -> Self {
        Self::parse()
    }

    /// Get the default log filter based on build profile
    pub fn default_log_filter() -> &'static str {
        #[cfg(debug_assertions)]
        {
            "debug"
        }
        #[cfg(not(debug_assertions))]
        {
            "warn"
        }
    }

    /// Get the effective log filter
    ///
    /// Priority (highest to lowest):
    /// 1. --debug flag (returns "debug")
    /// 2. --log-filter argument
    /// 3. RUST_LOG environment variable (handled by caller)
    /// 4. Default based on build profile
    pub fn effective_log_filter(&self) -> Option<&str> {
        if self.debug {
            Some("debug")
        } else {
            self.log_filter.as_deref()
        }
    }

    /// Handle kill command if --kill flag is set
    ///
    /// This should be called early in main() before any other initialization.
    /// If kill flag is set, sends shutdown command and exits the process.
    pub fn handle_kill_if_requested(
        &self
    ) {
        if !self.kill {
            return;
        }

        let pid = read_mqtt_pid();

        if pid == 0 {
            eprintln!("Error: No running instance found (PID is 0)");
            process::exit(1);
        }

        println!("Sending shutdown command to process with PID {}...", pid);

        match send_shutdown_command(pid) {
            Ok(()) => {
                println!("✓ Shutdown command sent successfully to PID {}", pid);
                process::exit(0);
            }
            Err(e) => {
                eprintln!("✗ Failed to send shutdown command: {}", e);
                process::exit(1);
            }
        }
    }
}

impl Default for Args {
    fn default() -> Self {
        Self::new()
    }
}

/// Validate that a directory exists, is a directory, and is writable
fn validate_directory(path: &PathBuf) -> Result<(), String> {
    if !path.exists() {
        return Err(format!("Path does not exist: {}", path.display()));
    }

    if !path.is_dir() {
        return Err(format!("Path is not a directory: {}", path.display()));
    }

    NamedTempFile::new_in(path)
        .map(|_temp_file| ())
        .map_err(|e| format!("Directory is not writable ({}): {}", e, path.display()))?;

    Ok(())
}

/// Parse and validate a writable directory path
fn parse_writable_dir(path_str: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(path_str);
    validate_directory(&path)?;
    fs::canonicalize(&path)
        .map_err(|e| format!("Failed to canonicalize path '{}': {}", path.display(), e))
}

/// Parse and validate log file path (ensures parent directory exists and is writable)
fn parse_log_file_path(path_str: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(path_str);

    let parent = path
        .parent()
        .ok_or_else(|| format!("Invalid log file path: {}", path.display()))?;

    if !parent.exists() {
        fs::create_dir_all(parent).map_err(|e| {
            format!(
                "Failed to create log directory '{}': {}",
                parent.display(),
                e
            )
        })?;
    }

    validate_directory(&parent.to_path_buf())?;

    Ok(path)
}
