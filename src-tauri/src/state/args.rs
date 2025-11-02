use clap::Parser;
use std::fs;
use std::path::PathBuf;
use tempfile::NamedTempFile;
use tracing::Level;

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

    /// Enable debug mode (sets log level to DEBUG)
    #[arg(short, long)]
    pub debug: bool,

    /// Log level(sase-insensitive): TRACE, DEBUG, INFO, WARN, ERROR
    ///
    /// Defaults to 'DEBUG' in debug builds and 'WARN' in release builds.
    /// Overridden by --debug flag.
    #[arg(
        short = 'l',
        long = "log-level",
        default_value_t = Self::default_log_level(),
        value_name = "LEVEL"
    )]
    pub log_level: Level,

    /// Log file path
    ///
    /// If not specified, logs only to terminal.
    #[arg(
        long = "log-file",
        value_name = "FILE",
        value_parser = parse_log_file_path
    )]
    pub log_file: Option<PathBuf>,
}

impl Args {
    /// Create Args by parsing command-line arguments
    pub fn new() -> Self {
        Self::parse()
    }

    /// Get the default log level based on build profile
    pub const fn default_log_level() -> Level {
        #[cfg(debug_assertions)]
        {
            Level::DEBUG
        }
        #[cfg(not(debug_assertions))]
        {
            Level::WARN
        }
    }

    /// Get the effective log level (debug flag overrides log-level)
    pub fn effective_log_level(&self) -> Level {
        if self.debug {
            Level::DEBUG
        } else {
            self.log_level
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
