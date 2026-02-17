use std::fs;
use std::path::PathBuf;
use tauri::Manager;

use crate::error::AppError;
use crate::helpers::ensure_dir;
use crate::models::AppState;

pub fn app_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, AppError> {
    app.path()
        .app_data_dir()
        .map_err(|e| AppError::NotFound(format!("Failed to resolve app data dir: {e}")))
}

pub fn app_state_path(app: &tauri::AppHandle) -> Result<PathBuf, AppError> {
    Ok(app_data_dir(app)?.join("state.json"))
}

pub fn load_state(app: &tauri::AppHandle) -> Result<AppState, AppError> {
    let state_path = app_state_path(app)?;
    if !state_path.exists() {
        return Ok(AppState::default());
    }

    let content = fs::read_to_string(&state_path)?;
    let state = serde_json::from_str(&content)?;
    Ok(state)
}

pub fn save_state(app: &tauri::AppHandle, state: &AppState) -> Result<(), AppError> {
    let state_path = app_state_path(app)?;
    if let Some(parent) = state_path.parent() {
        ensure_dir(parent)?;
    }

    let json = serde_json::to_string_pretty(state)?;
    fs::write(&state_path, json)?;
    Ok(())
}
