mod commands;
mod error;
mod helpers;
mod models;
mod skills;
mod state;
mod tools;

use commands::{
    copy_skill_to_tool, create_github_gist, create_skill_dir, delete_custom_tool, delete_skill, delete_skill_empty_dir,
    delete_skill_entry, debug_log, discover_skills_paths, get_dashboard_data, install_from_registry, install_skill_from_github,
    list_skill_files, read_skill_entry, read_skill_file, rename_skill_entry, reorder_tools,
    reveal_in_finder, save_skill_entry, save_skill_file, search_skills, set_github_token,
    set_skill_editor_default_mode, set_tool_enabled, upsert_custom_tool,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_dashboard_data,
            set_tool_enabled,
            read_skill_file,
            list_skill_files,
            read_skill_entry,
            save_skill_file,
            save_skill_entry,
            create_skill_dir,
            rename_skill_entry,
            delete_skill_entry,
            delete_skill_empty_dir,
            delete_skill,
            install_skill_from_github,
            search_skills,
            install_from_registry,
            copy_skill_to_tool,
            upsert_custom_tool,
            discover_skills_paths,
            delete_custom_tool,
            reorder_tools,
            reveal_in_finder,
            set_github_token,
            set_skill_editor_default_mode,
            create_github_gist,
            debug_log
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
