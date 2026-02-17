mod commands;
mod error;
mod helpers;
mod models;
mod skills;
mod state;
mod tools;

use commands::{
    delete_custom_tool, delete_skill, get_dashboard_data, install_from_registry,
    install_skill_from_github, read_skill_file, reorder_tools, reveal_in_finder, save_skill_file,
    search_skills, set_tool_enabled, upsert_custom_tool,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_dashboard_data,
            set_tool_enabled,
            read_skill_file,
            save_skill_file,
            delete_skill,
            install_skill_from_github,
            search_skills,
            install_from_registry,
            upsert_custom_tool,
            delete_custom_tool,
            reorder_tools,
            reveal_in_finder
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
