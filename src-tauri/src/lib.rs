use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use tokio::process::Command;

const MANAGED_MARKER: &str = "# Managed by Rust Git SSH Manager";
const APP_DIR_NAME: &str = "git-ssh-manager";
const APP_STATE_FILE: &str = "state.json";
const PLATFORM_CODEUP: &str = "codeup";
const PLATFORM_GITHUB: &str = "github";
const PLATFORM_GITLAB: &str = "gitlab";
const PLATFORM_CUSTOM: &str = "custom";

fn default_platform() -> String {
    PLATFORM_CUSTOM.to_string()
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AccountConfig {
    #[serde(default = "default_platform")]
    platform: String,
    host_alias: String,
    host_name: String,
    user: String,
    email: String,
    key_name: String,
    workspace_path: Option<String>,
    git_user_name: Option<String>,
    reuse_existing_key: Option<bool>,
    selected_repo_paths: Option<Vec<String>>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AccountMeta {
    #[serde(default = "default_platform")]
    platform: String,
    host_alias: String,
    host_name: String,
    user: String,
    email: String,
    key_name: String,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct WorkspaceBinding {
    host_alias: String,
    workspace_path: String,
    git_user_name: String,
    git_email: String,
    #[serde(default)]
    workspace_root: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
struct AppStateFile {
    accounts: Vec<AccountMeta>,
    workspace_bindings: Vec<WorkspaceBinding>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ManagedAccount {
    platform: String,
    host_alias: String,
    host_name: String,
    user: String,
    email: String,
    key_name: String,
    key_path: String,
    public_key_path: String,
    workspaces: Vec<WorkspaceBinding>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ExistingKey {
    key_name: String,
    key_path: String,
    public_key_path: String,
    managed_hosts: Vec<String>,
    workspace_paths: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DashboardData {
    managed_accounts: Vec<ManagedAccount>,
    existing_keys: Vec<ExistingKey>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SshTestResult {
    success: bool,
    message: String,
}

#[derive(Debug)]
struct ParsedRepositoryUrl {
    clone_url: String,
    repository_path: String,
    repository_dir_name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceApplyRequest {
    host_alias: String,
    workspace_root: String,
    git_user_name: String,
    git_email: String,
    repository_paths: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CloneRepositoryRequest {
    host_alias: String,
    parent_directory: String,
    git_url: String,
    git_user_name: String,
    git_email: String,
    #[serde(default)]
    directory_name: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScannedRepository {
    name: String,
    path: String,
    relative_path: String,
    origin_url: Option<String>,
}

#[derive(Debug, Clone)]
struct ConfigBlock {
    remove_start: usize,
    remove_end: usize,
    host_alias: String,
    host_name: String,
    user: String,
    identity_file: String,
    managed: bool,
}

#[tauri::command]
async fn list_dashboard() -> Result<DashboardData, String> {
    build_dashboard_data()
}

#[tauri::command]
async fn add_account(config: AccountConfig) -> Result<String, String> {
    let config = normalize_account_config(config);
    validate_account_config(&config)?;

    let ssh_dir = ensure_ssh_dir()?;
    let key_path = ssh_dir.join(&config.key_name);
    let public_key_path = ssh_dir.join(format!("{}.pub", config.key_name));
    let reuse_existing_key = config.reuse_existing_key.unwrap_or(false);

    if key_path.exists() {
        if !reuse_existing_key {
            return Err(format!(
                "密钥 {} 已存在。如需复用，请勾选“复用已有密钥”。",
                config.key_name
            ));
        }
    } else {
        generate_key_pair(&key_path, &config.email).await?;
    }

    remove_config_blocks_by_aliases(&[config.host_alias.clone()])?;
    append_config_entry(&config, &key_path)?;

    let mut state = read_app_state()?;
    upsert_account_meta(
        &mut state,
        AccountMeta {
            platform: config.platform.clone(),
            host_alias: config.host_alias.clone(),
            host_name: config.host_name.clone(),
            user: config.user.clone(),
            email: config.email.clone(),
            key_name: config.key_name.clone(),
        },
    );

    let mut messages = vec![format!(
        "账号 {} 已保存，公钥路径：{}",
        config.host_alias,
        normalize_path(&public_key_path)
    )];

    if let Some(workspace_path) = config.workspace_path.as_deref() {
        if !workspace_path.trim().is_empty() {
            let selected_repo_paths = config
                .selected_repo_paths
                .clone()
                .unwrap_or_default()
                .into_iter()
                .filter(|item| !item.trim().is_empty())
                .collect::<Vec<_>>();

            if !selected_repo_paths.is_empty() {
                let request = WorkspaceApplyRequest {
                    host_alias: config.host_alias.clone(),
                    workspace_root: workspace_path.trim().to_string(),
                    git_user_name: config
                        .git_user_name
                        .clone()
                        .unwrap_or_else(|| "Git SSH Manager".to_string()),
                    git_email: config.email.clone(),
                    repository_paths: selected_repo_paths,
                };

                let git_message = apply_workspace_binding_internal(&mut state, &request).await?;
                messages.push(git_message);
            } else {
                let binding = WorkspaceBinding {
                    host_alias: config.host_alias.clone(),
                    workspace_path: workspace_path.trim().to_string(),
                    git_user_name: config
                        .git_user_name
                        .clone()
                        .unwrap_or_else(|| "Git SSH Manager".to_string()),
                    git_email: config.email.clone(),
                    workspace_root: Some(workspace_path.trim().to_string()),
                };

                let git_message = attach_workspace_internal(&mut state, binding).await?;
                messages.push(git_message);
            }
        }
    }

    write_app_state(&state)?;
    Ok(messages.join("\n"))
}

#[tauri::command]
async fn test_ssh_connection(config: AccountConfig) -> Result<SshTestResult, String> {
    let config = normalize_account_config(config);
    validate_test_config(&config)?;

    let key_path = ensure_ssh_dir()?.join(&config.key_name);
    if !key_path.exists() {
        return Err(format!("未找到私钥文件：{}", normalize_path(&key_path)));
    }

    let target = format!("{}@{}", config.user.trim(), config.host_name.trim());
    let output = Command::new("ssh")
        .args([
            "-T",
            "-o",
            "BatchMode=yes",
            "-o",
            "StrictHostKeyChecking=accept-new",
            "-o",
            "ConnectTimeout=10",
            "-i",
            key_path
                .to_str()
                .ok_or("密钥路径包含无法识别的字符。")?,
            &target,
        ])
        .output()
        .await
        .map_err(|e| format!("执行 SSH 测试失败: {}", e))?;

    let message = combined_output(&output.stdout, &output.stderr);
    let success = output.status.success() || looks_like_ssh_auth_success(&message);
    Ok(SshTestResult {
        success,
        message: if success {
            if message.trim().is_empty() {
                format!("连接成功，已通过 {} 完成认证。", config.host_alias)
            } else {
                message
            }
        } else if message.trim().is_empty() {
            "SSH 测试失败，但没有返回详细输出。".to_string()
        } else {
            message
        },
    })
}

#[tauri::command]
async fn scan_workspace_repositories(workspace_path: String) -> Result<Vec<ScannedRepository>, String> {
    let workspace_root = PathBuf::from(workspace_path.trim());
    if !workspace_root.exists() || !workspace_root.is_dir() {
        return Err("选择的工作区文件夹不存在。".to_string());
    }

    let repositories = collect_git_repositories(&workspace_root)?;
    let mut result = Vec::new();
    for repo_path in repositories {
        let normalized_path = normalize_path(&repo_path);
        let relative_path = repo_path
            .strip_prefix(&workspace_root)
            .ok()
            .and_then(|relative| {
                let value = normalize_path(relative);
                if value.is_empty() {
                    None
                } else {
                    Some(value)
                }
            })
            .unwrap_or_else(|| file_name_string(&repo_path));

        let origin_url = run_git_command(&repo_path, &["remote", "get-url", "origin"])
            .await
            .ok()
            .filter(|value| !value.trim().is_empty());

        result.push(ScannedRepository {
            name: file_name_string(&repo_path),
            path: normalized_path,
            relative_path,
            origin_url,
        });
    }

    result.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(result)
}

#[tauri::command]
async fn apply_workspace_binding(request: WorkspaceApplyRequest) -> Result<String, String> {
    let workspace_root = PathBuf::from(request.workspace_root.trim());
    if !workspace_root.exists() || !workspace_root.is_dir() {
        return Err("选择的工作区文件夹不存在。".to_string());
    }
    if request.host_alias.trim().is_empty() {
        return Err("Host 别名不能为空。".to_string());
    }
    if request.git_email.trim().is_empty() {
        return Err("Git 邮箱不能为空。".to_string());
    }
    if request.repository_paths.is_empty() {
        return Err("请至少勾选一个 Git 仓库。".to_string());
    }

    let mut state = read_app_state()?;
    let message = apply_workspace_binding_internal(&mut state, &request).await?;
    write_app_state(&state)?;
    Ok(message)
}

#[tauri::command]
async fn clone_repository(request: CloneRepositoryRequest) -> Result<String, String> {
    let parent_directory = PathBuf::from(request.parent_directory.trim());
    if !parent_directory.exists() || !parent_directory.is_dir() {
        return Err("选择的父目录不存在。".to_string());
    }
    if request.host_alias.trim().is_empty() {
        return Err("Host 别名不能为空。".to_string());
    }
    if request.git_user_name.trim().is_empty() {
        return Err("Git 用户名不能为空。".to_string());
    }
    if request.git_email.trim().is_empty() {
        return Err("Git 邮箱不能为空。".to_string());
    }

    ensure_host_alias_exists(request.host_alias.trim())?;
    let parsed = parse_repository_url_for_clone(&request.git_url, request.host_alias.trim())?;

    let directory_name = request
        .directory_name
        .as_deref()
        .map(str::trim)
        .filter(|name| !name.is_empty());
    let target_directory = match directory_name {
        Some(name) => {
            validate_directory_name(name)?;
            parent_directory.join(name)
        }
        None => parent_directory.join(&parsed.repository_dir_name),
    };
    if target_directory.exists() {
        return Err(format!(
            "目标目录已存在：{}",
            normalize_path(&target_directory)
        ));
    }

    let target_dir_name = target_directory
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(&parsed.repository_dir_name);

    let output = Command::new("git")
        .current_dir(&parent_directory)
        .args([
            "clone",
            parsed.clone_url.as_str(),
            target_dir_name,
        ])
        .output()
        .await
        .map_err(|e| format!("执行 git clone 失败: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "git clone 失败: {}",
            combined_output(&output.stdout, &output.stderr)
        ));
    }

    let mut state = read_app_state()?;
    let apply_request = WorkspaceApplyRequest {
        host_alias: request.host_alias.trim().to_string(),
        workspace_root: normalize_path(&parent_directory),
        git_user_name: request.git_user_name.trim().to_string(),
        git_email: request.git_email.trim().to_string(),
        repository_paths: vec![normalize_path(&target_directory)],
    };

    let apply_message = apply_workspace_binding_internal(&mut state, &apply_request).await?;
    write_app_state(&state)?;

    Ok(format!(
        "仓库已克隆到：{}\n原始路径：{}\n{}\n{}",
        normalize_path(&target_directory),
        parsed.repository_path,
        combined_output(&output.stdout, &output.stderr),
        apply_message
    ))
}

#[tauri::command]
async fn refresh_account_workspaces(host_alias: String) -> Result<String, String> {
    let host_alias = host_alias.trim().to_string();
    if host_alias.is_empty() {
        return Err("Host 别名不能为空。".to_string());
    }

    let mut state = read_app_state()?;

    let roots: Vec<String> = state
        .workspace_bindings
        .iter()
        .filter(|binding| binding.host_alias == host_alias)
        .map(|binding| {
            binding
                .workspace_root
                .clone()
                .unwrap_or_else(|| binding.workspace_path.clone())
        })
        .collect();

    if roots.is_empty() {
        return Err(format!(
            "账号 {} 尚未绑定工作区，无法刷新。可先在「账号配置」中绑定。",
            host_alias
        ));
    }

    let mut unique_roots = roots.clone();
    unique_roots.sort();
    unique_roots.dedup();

    let bound_by_others: HashSet<String> = state
        .workspace_bindings
        .iter()
        .filter(|binding| binding.host_alias != host_alias)
        .map(|binding| binding.workspace_path.clone())
        .collect();

    let mut messages = Vec::new();
    let mut applied_any = false;

    for root in unique_roots {
        let workspace_root = PathBuf::from(&root);
        if !workspace_root.exists() || !workspace_root.is_dir() {
            messages.push(format!("工作区不存在，已跳过：{}", root));
            continue;
        }

        let repositories = collect_git_repositories(&workspace_root)?;
        if repositories.is_empty() {
            messages.push(format!("工作区下未发现 Git 仓库：{}", root));
            continue;
        }

        let repository_paths: Vec<String> = repositories
            .iter()
            .map(|path| normalize_path(path))
            .filter(|path| !bound_by_others.contains(path))
            .collect();

        if repository_paths.is_empty() {
            messages.push(format!("工作区 {} 下没有需要刷新的仓库（其余仓库已绑定其他账号）。", root));
            continue;
        }

        let existing = state.workspace_bindings.iter().find(|binding| {
            binding.host_alias == host_alias
                && binding
                    .workspace_root
                    .as_deref()
                    .map(|value| value == root)
                    .unwrap_or(false)
        });
        let git_user_name = existing
            .map(|binding| binding.git_user_name.clone())
            .unwrap_or_else(|| "Git SSH Manager".to_string());
        let git_email = existing
            .map(|binding| binding.git_email.clone())
            .unwrap_or_default();

        let request = WorkspaceApplyRequest {
            host_alias: host_alias.clone(),
            workspace_root: root.clone(),
            git_user_name,
            git_email,
            repository_paths,
        };

        let message = apply_workspace_binding_internal(&mut state, &request).await?;
        messages.push(format!("{}：{}", root, message));
        applied_any = true;
    }

    write_app_state(&state)?;

    if !applied_any {
        messages.push(format!("账号 {} 没有可刷新的工作区。", host_alias));
    }
    messages.push(format!("账号 {} 工作区刷新完成。", host_alias));

    Ok(messages.join("\n"))
}

#[tauri::command]
async fn delete_account(host_alias: String, delete_key_files: bool) -> Result<String, String> {
    let state = read_app_state()?;
    let account = state
        .accounts
        .iter()
        .find(|item| item.host_alias == host_alias)
        .cloned();

    remove_config_blocks_by_aliases(&[host_alias.clone()])?;

    let mut next_state = state.clone();
    next_state.accounts.retain(|item| item.host_alias != host_alias);
    next_state
        .workspace_bindings
        .retain(|item| item.host_alias != host_alias);
    write_app_state(&next_state)?;

    let mut messages = vec![format!("账号 {} 已删除。", host_alias)];

    if delete_key_files {
        if let Some(account) = account {
            let ssh_dir = ensure_ssh_dir()?;
            let key_path = ssh_dir.join(&account.key_name);
            let public_key_path = ssh_dir.join(format!("{}.pub", account.key_name));
            delete_if_exists(&key_path)?;
            delete_if_exists(&public_key_path)?;
            messages.push(format!("密钥 {} 及其公钥文件已删除。", account.key_name));
        }
    }

    Ok(messages.join("\n"))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct EnvironmentStatus {
    git_available: bool,
    git_version: Option<String>,
    has_ssh_keys: bool,
    ssh_dir: String,
}

#[tauri::command]
async fn check_environment() -> Result<EnvironmentStatus, String> {
    let git_output = Command::new("git").arg("--version").output().await.ok();
    let git_available = git_output
        .as_ref()
        .is_some_and(|output| output.status.success());
    let git_version = git_output
        .filter(|output| output.status.success())
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string())
        .filter(|text| !text.is_empty());

    let home_dir = dirs::home_dir().ok_or("无法获取用户主目录。")?;
    let ssh_dir = home_dir.join(".ssh");
    let has_ssh_keys = if ssh_dir.is_dir() {
        !scan_existing_keys(&ssh_dir).unwrap_or_default().is_empty()
    } else {
        false
    };

    Ok(EnvironmentStatus {
        git_available,
        git_version,
        has_ssh_keys,
        ssh_dir: normalize_path(&ssh_dir),
    })
}

#[tauri::command]
async fn read_public_key(key_name: String) -> Result<String, String> {
    let ssh_dir = ensure_ssh_dir()?;
    let public_key_path = ssh_dir.join(format!("{}.pub", key_name));
    if !public_key_path.exists() {
        return Err(format!(
            "未找到公钥文件：{}",
            normalize_path(&public_key_path)
        ));
    }

    fs::read_to_string(&public_key_path)
        .map(|content| content.trim().to_string())
        .map_err(|e| format!("读取公钥失败: {}", e))
}

#[tauri::command]
async fn create_key(key_name: String, email: Option<String>) -> Result<String, String> {
    let key_name = key_name.trim().to_string();
    if key_name.is_empty() {
        return Err("密钥文件名不能为空。".to_string());
    }
    if key_name.ends_with(".pub") {
        return Err("密钥文件名不能以 .pub 结尾。".to_string());
    }
    if key_name
        .chars()
        .any(|ch| matches!(ch, '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' | ' '))
    {
        return Err("密钥文件名包含非法字符，请使用字母、数字、下划线或连字符。".to_string());
    }

    let ssh_dir = ensure_ssh_dir()?;
    let key_path = ssh_dir.join(&key_name);
    let public_key_path = ssh_dir.join(format!("{}.pub", key_name));
    if key_path.exists() || public_key_path.exists() {
        return Err(format!("密钥 {} 已存在。", key_name));
    }

    let email = email
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    generate_key_pair(&key_path, email.as_deref().unwrap_or("git-ssh-manager")).await?;

    Ok(format!(
        "已创建密钥对：{}\n公钥：{}",
        normalize_path(&key_path),
        normalize_path(&public_key_path)
    ))
}

#[tauri::command]
async fn delete_key(key_name: String) -> Result<String, String> {
    let ssh_dir = ensure_ssh_dir()?;
    let key_path = ssh_dir.join(&key_name);
    let normalized_key_path = normalize_path(&key_path);

    let config_blocks = read_config_blocks()?;
    let mut affected_aliases: HashSet<String> = config_blocks
        .iter()
        .filter(|block| block.identity_file == normalized_key_path)
        .map(|block| block.host_alias.clone())
        .collect();

    let mut state = read_app_state()?;
    for account in &state.accounts {
        if account.key_name == key_name {
            affected_aliases.insert(account.host_alias.clone());
        }
    }

    if !affected_aliases.is_empty() {
        let aliases: Vec<String> = affected_aliases.iter().cloned().collect();
        remove_config_blocks_by_aliases(&aliases)?;
        state
            .accounts
            .retain(|account| !affected_aliases.contains(&account.host_alias));
        state
            .workspace_bindings
            .retain(|binding| !affected_aliases.contains(&binding.host_alias));
        write_app_state(&state)?;
    }

    delete_if_exists(&key_path)?;
    delete_if_exists(&ssh_dir.join(format!("{}.pub", key_name)))?;

    Ok(format!("密钥 {} 已删除。", key_name))
}

fn build_dashboard_data() -> Result<DashboardData, String> {
    let ssh_dir = ensure_ssh_dir()?;
    let config_blocks = read_config_blocks()?;
    let state = read_app_state()?;

    let mut account_by_alias: HashMap<String, ManagedAccount> = HashMap::new();
    for account in &state.accounts {
        let key_path = ssh_dir.join(&account.key_name);
        let public_key_path = ssh_dir.join(format!("{}.pub", account.key_name));
        account_by_alias.insert(
            account.host_alias.clone(),
            ManagedAccount {
                platform: normalize_platform(&account.platform),
                host_alias: account.host_alias.clone(),
                host_name: account.host_name.clone(),
                user: account.user.clone(),
                email: account.email.clone(),
                key_name: account.key_name.clone(),
                key_path: normalize_path(&key_path),
                public_key_path: normalize_path(&public_key_path),
                workspaces: Vec::new(),
            },
        );
    }

    for block in &config_blocks {
        if !block.managed {
            continue;
        }

        let key_name = key_name_from_identity_file(&block.identity_file);
        let public_key_path = format!("{}.pub", block.identity_file);
        account_by_alias
            .entry(block.host_alias.clone())
            .and_modify(|account| {
                account.host_name = block.host_name.clone();
                account.user = block.user.clone();
                account.key_path = block.identity_file.clone();
                account.public_key_path = public_key_path.clone();
                account.key_name = key_name.clone();
            })
            .or_insert(ManagedAccount {
                platform: infer_platform_from_host_name(&block.host_name),
                host_alias: block.host_alias.clone(),
                host_name: block.host_name.clone(),
                user: block.user.clone(),
                email: String::new(),
                key_name,
                key_path: block.identity_file.clone(),
                public_key_path,
                workspaces: Vec::new(),
            });
    }

    for binding in &state.workspace_bindings {
        if let Some(account) = account_by_alias.get_mut(&binding.host_alias) {
            account.workspaces.push(binding.clone());
        }
    }

    let mut managed_accounts: Vec<ManagedAccount> = account_by_alias.into_values().collect();
    managed_accounts.sort_by(|a, b| a.host_alias.cmp(&b.host_alias));

    let mut workspace_map: HashMap<String, Vec<String>> = HashMap::new();
    for binding in &state.workspace_bindings {
        workspace_map
            .entry(binding.host_alias.clone())
            .or_default()
            .push(binding.workspace_path.clone());
    }

    let mut host_map: HashMap<String, Vec<String>> = HashMap::new();
    for block in &config_blocks {
        host_map
            .entry(block.identity_file.clone())
            .or_default()
            .push(block.host_alias.clone());
    }

    let mut existing_keys = scan_existing_keys(&ssh_dir)?
        .into_iter()
        .map(|key_path| {
            let normalized = normalize_path(&key_path);
            let managed_hosts = host_map.get(&normalized).cloned().unwrap_or_default();
            let mut workspace_paths = Vec::new();
            for host in &managed_hosts {
                workspace_paths.extend(workspace_map.get(host).cloned().unwrap_or_default());
            }
            workspace_paths.sort();
            workspace_paths.dedup();

            ExistingKey {
                key_name: file_name_string(&key_path),
                key_path: normalized.clone(),
                public_key_path: format!("{}.pub", normalized),
                managed_hosts,
                workspace_paths,
            }
        })
        .collect::<Vec<_>>();

    existing_keys.sort_by(|a, b| a.key_name.cmp(&b.key_name));

    Ok(DashboardData {
        managed_accounts,
        existing_keys,
    })
}

fn normalize_account_config(mut config: AccountConfig) -> AccountConfig {
    config.platform = normalize_platform(&config.platform);
    config.host_alias = config.host_alias.trim().to_string();
    config.host_name = config.host_name.trim().to_string();
    config.user = if config.user.trim().is_empty() {
        "git".to_string()
    } else {
        config.user.trim().to_string()
    };
    config.email = config.email.trim().to_string();
    config.key_name = config.key_name.trim().to_string();

    if let Some(default_host_name) = platform_host_name(&config.platform) {
        config.host_name = default_host_name.to_string();
    }

    config
}

fn normalize_platform(platform: &str) -> String {
    match platform.trim().to_lowercase().as_str() {
        PLATFORM_CODEUP => PLATFORM_CODEUP.to_string(),
        PLATFORM_GITHUB => PLATFORM_GITHUB.to_string(),
        PLATFORM_GITLAB => PLATFORM_GITLAB.to_string(),
        _ => PLATFORM_CUSTOM.to_string(),
    }
}

fn platform_host_name(platform: &str) -> Option<&'static str> {
    match platform {
        PLATFORM_CODEUP => Some("codeup.aliyun.com"),
        PLATFORM_GITHUB => Some("github.com"),
        PLATFORM_GITLAB => Some("gitlab.com"),
        _ => None,
    }
}

fn infer_platform_from_host_name(host_name: &str) -> String {
    match host_name.trim() {
        "codeup.aliyun.com" => PLATFORM_CODEUP.to_string(),
        "github.com" => PLATFORM_GITHUB.to_string(),
        "gitlab.com" => PLATFORM_GITLAB.to_string(),
        _ => PLATFORM_CUSTOM.to_string(),
    }
}

fn validate_account_config(config: &AccountConfig) -> Result<(), String> {
    validate_test_config(config)?;

    if config.email.trim().is_empty() {
        return Err("邮箱不能为空。".to_string());
    }

    Ok(())
}

fn validate_test_config(config: &AccountConfig) -> Result<(), String> {
    if config.host_alias.trim().is_empty() {
        return Err("Host 别名不能为空。".to_string());
    }
    if config.host_alias.contains(' ') {
        return Err("Host 别名不能包含空格。".to_string());
    }
    if config.host_name.trim().is_empty() {
        return Err("真实域名不能为空。".to_string());
    }
    if config.user.trim().is_empty() {
        return Err("SSH 用户不能为空。".to_string());
    }
    if config.key_name.trim().is_empty() {
        return Err("密钥文件名不能为空。".to_string());
    }
    Ok(())
}

async fn generate_key_pair(key_path: &Path, email: &str) -> Result<(), String> {
    let output = Command::new("ssh-keygen")
        .args([
            "-t",
            "ed25519",
            "-f",
            key_path
                .to_str()
                .ok_or("密钥路径包含无法识别的字符。")?,
            "-C",
            email,
            "-N",
            "",
            "-q",
        ])
        .output()
        .await
        .map_err(|e| format!("生成密钥失败: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "密钥生成错误: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    Ok(())
}

async fn attach_workspace_internal(
    state: &mut AppStateFile,
    binding: WorkspaceBinding,
) -> Result<String, String> {
    let workspace_path = PathBuf::from(binding.workspace_path.trim());
    if !workspace_path.exists() || !workspace_path.is_dir() {
        return Err("选择的工作区文件夹不存在。".to_string());
    }

    state
        .workspace_bindings
        .retain(|item| item.workspace_path != binding.workspace_path);
    state.workspace_bindings.push(binding.clone());

    let mut messages = vec![format!(
        "工作区已绑定到账号 {}：{}",
        binding.host_alias, binding.workspace_path
    )];

    messages.push(configure_workspace_git(&binding).await?);
    Ok(messages.join("\n"))
}

async fn apply_workspace_binding_internal(
    state: &mut AppStateFile,
    request: &WorkspaceApplyRequest,
) -> Result<String, String> {
    let workspace_root = normalize_path(Path::new(request.workspace_root.trim()));
    let mut repository_bindings = Vec::new();

    for repo_path in &request.repository_paths {
        let normalized_repo_path = normalize_path(Path::new(repo_path.trim()));
        if normalized_repo_path.is_empty() {
            continue;
        }

        let repo_dir = PathBuf::from(&normalized_repo_path);
        if !repo_dir.exists() || !repo_dir.is_dir() || !repo_dir.join(".git").exists() {
            return Err(format!("以下目录不是有效的 Git 仓库：{}", normalized_repo_path));
        }

        repository_bindings.push(WorkspaceBinding {
            host_alias: request.host_alias.trim().to_string(),
            workspace_path: normalized_repo_path,
            git_user_name: request.git_user_name.trim().to_string(),
            git_email: request.git_email.trim().to_string(),
            workspace_root: Some(workspace_root.clone()),
        });
    }

    if repository_bindings.is_empty() {
        return Err("请至少勾选一个 Git 仓库。".to_string());
    }

    let selected_paths: HashSet<String> = repository_bindings
        .iter()
        .map(|binding| binding.workspace_path.clone())
        .collect();

    state.workspace_bindings.retain(|binding| {
        if binding.host_alias != request.host_alias.trim() {
            return true;
        }

        let same_root = binding.workspace_root.as_deref() == Some(workspace_root.as_str())
            || binding.workspace_path == workspace_root;
        if !same_root {
            return true;
        }

        selected_paths.contains(&binding.workspace_path)
    });

    for binding in &repository_bindings {
        state
            .workspace_bindings
            .retain(|item| item.workspace_path != binding.workspace_path);
        state.workspace_bindings.push(binding.clone());
    }

    state
        .workspace_bindings
        .sort_by(|a, b| a.workspace_path.cmp(&b.workspace_path));

    configure_selected_repositories(&repository_bindings).await
}

async fn configure_workspace_git(binding: &WorkspaceBinding) -> Result<String, String> {
    let workspace_path = PathBuf::from(&binding.workspace_path);
    let repositories = collect_git_repositories(&workspace_path)?;
    if repositories.is_empty() {
        return Ok("当前工作区下未发现 Git 仓库，已保存绑定记录，未写入 Git 配置。".to_string());
    }

    let mut updated_repos = Vec::new();
    let mut no_origin_repos = Vec::new();
    let mut unchanged_origin_repos = Vec::new();

    for repo_path in &repositories {
        run_git_command(repo_path, &["config", "user.name", &binding.git_user_name]).await?;
        run_git_command(repo_path, &["config", "user.email", &binding.git_email]).await?;

        let origin_result = run_git_command(repo_path, &["remote", "get-url", "origin"]).await;
        match origin_result {
            Ok(origin_url) => {
                if let Some(new_url) = rewrite_remote_url(origin_url.trim(), &binding.host_alias) {
                    run_git_command(repo_path, &["remote", "set-url", "origin", new_url.as_str()])
                        .await?;
                    updated_repos.push(format!(
                        "{} -> {}",
                        normalize_path(repo_path),
                        new_url
                    ));
                } else {
                    unchanged_origin_repos.push(normalize_path(repo_path));
                }
            }
            Err(_) => no_origin_repos.push(normalize_path(repo_path)),
        }
    }

    let mut messages = vec![format!(
        "已在工作区下匹配到 {} 个 Git 仓库并写入 user.name / user.email。",
        repositories.len()
    )];

    if !updated_repos.is_empty() {
        messages.push(format!(
            "已改写 origin 的仓库:\n{}",
            updated_repos.join("\n")
        ));
    }

    if !no_origin_repos.is_empty() {
        messages.push(format!(
            "以下仓库没有 origin，未改写 remote:\n{}",
            no_origin_repos.join("\n")
        ));
    }

    if !unchanged_origin_repos.is_empty() {
        messages.push(format!(
            "以下仓库的 origin 格式无法自动改写:\n{}",
            unchanged_origin_repos.join("\n")
        ));
    }

    Ok(messages.join("\n"))
}

async fn configure_selected_repositories(bindings: &[WorkspaceBinding]) -> Result<String, String> {
    let mut updated_repos = Vec::new();
    let mut no_origin_repos = Vec::new();
    let mut unchanged_origin_repos = Vec::new();

    for binding in bindings {
        let repo_path = PathBuf::from(&binding.workspace_path);
        run_git_command(&repo_path, &["config", "user.name", &binding.git_user_name]).await?;
        run_git_command(&repo_path, &["config", "user.email", &binding.git_email]).await?;

        let origin_result = run_git_command(&repo_path, &["remote", "get-url", "origin"]).await;
        match origin_result {
            Ok(origin_url) => {
                if let Some(new_url) = rewrite_remote_url(origin_url.trim(), &binding.host_alias) {
                    run_git_command(&repo_path, &["remote", "set-url", "origin", new_url.as_str()])
                        .await?;
                    updated_repos.push(format!(
                        "{} -> {}",
                        normalize_path(&repo_path),
                        new_url
                    ));
                } else {
                    unchanged_origin_repos.push(normalize_path(&repo_path));
                }
            }
            Err(_) => no_origin_repos.push(normalize_path(&repo_path)),
        }
    }

    let mut messages = vec![format!(
        "已对勾选的 {} 个仓库写入 user.name / user.email。",
        bindings.len()
    )];

    if !updated_repos.is_empty() {
        messages.push(format!(
            "已改写 origin 的仓库:\n{}",
            updated_repos.join("\n")
        ));
    }

    if !no_origin_repos.is_empty() {
        messages.push(format!(
            "以下仓库没有 origin，未改写 remote:\n{}",
            no_origin_repos.join("\n")
        ));
    }

    if !unchanged_origin_repos.is_empty() {
        messages.push(format!(
            "以下仓库的 origin 格式无法自动改写:\n{}",
            unchanged_origin_repos.join("\n")
        ));
    }

    Ok(messages.join("\n"))
}

fn ensure_host_alias_exists(host_alias: &str) -> Result<(), String> {
    let state = read_app_state()?;
    if state.accounts.iter().any(|account| account.host_alias == host_alias) {
        return Ok(());
    }

    let config_blocks = read_config_blocks()?;
    if config_blocks.iter().any(|block| block.host_alias == host_alias) {
        return Ok(());
    }

    Err(format!("未找到 Host 别名 {} 对应的账号配置。", host_alias))
}

fn parse_repository_url_for_clone(raw_url: &str, host_alias: &str) -> Result<ParsedRepositoryUrl, String> {
    let value = raw_url.trim();
    if value.is_empty() {
        return Err("Git 地址不能为空。".to_string());
    }

    if let Some((prefix, path)) = value.split_once(':') {
        if prefix.contains('@') {
            let user = prefix
                .split('@')
                .next()
                .filter(|item| !item.trim().is_empty())
                .unwrap_or("git");
            return build_clone_target(user, path, host_alias);
        }
    }

    if let Some(rest) = value.strip_prefix("ssh://") {
        let (authority, path) = rest
            .split_once('/')
            .ok_or("无法识别 SSH 仓库地址。".to_string())?;
        let user = authority
            .split('@')
            .next()
            .filter(|item| !item.trim().is_empty())
            .unwrap_or("git");
        return build_clone_target(user, path, host_alias);
    }

    if let Some(rest) = value
        .strip_prefix("https://")
        .or_else(|| value.strip_prefix("http://"))
    {
        let (_, path) = rest
            .split_once('/')
            .ok_or("无法识别 HTTPS 仓库地址。".to_string())?;
        return build_clone_target("git", path, host_alias);
    }

    Err("暂不支持当前 Git 地址格式。".to_string())
}

fn build_clone_target(user: &str, path: &str, host_alias: &str) -> Result<ParsedRepositoryUrl, String> {
    let repository_path = path.trim().trim_matches('/').to_string();
    if repository_path.is_empty() {
        return Err("Git 地址缺少仓库路径。".to_string());
    }

    let repository_name = repository_path
        .split('/')
        .last()
        .ok_or("Git 地址缺少仓库名。".to_string())?;
    let repository_dir_name = repository_name.trim_end_matches(".git").to_string();
    if repository_dir_name.is_empty() {
        return Err("无法从 Git 地址解析仓库目录名。".to_string());
    }

    Ok(ParsedRepositoryUrl {
        clone_url: format!("{}@{}:{}", user, host_alias, repository_path),
        repository_path,
        repository_dir_name,
    })
}

fn validate_directory_name(name: &str) -> Result<(), String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("文件夹名称不能为空。".to_string());
    }
    if name == "." || name == ".." {
        return Err("文件夹名称不合法。".to_string());
    }
    if name
        .chars()
        .any(|ch| matches!(ch, '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|'))
    {
        return Err("文件夹名称包含非法字符（\\ / : * ? \" < > |）。".to_string());
    }
    Ok(())
}

async fn run_git_command(workspace_path: &Path, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(workspace_path)
        .args(args)
        .output()
        .await
        .map_err(|e| format!("执行 git 命令失败: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "git 命令执行失败: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn rewrite_remote_url(current_url: &str, host_alias: &str) -> Option<String> {
    if let Some((prefix, path)) = current_url.split_once(':') {
        if prefix.contains('@') {
            let user = prefix.split('@').next()?;
            return Some(format!("{}@{}:{}", user, host_alias, path));
        }
    }

    if let Some(rest) = current_url.strip_prefix("ssh://") {
        let (authority, path) = rest.split_once('/')?;
        let user = authority.split('@').next().unwrap_or("git");
        return Some(format!("{}@{}:{}", user, host_alias, path));
    }

    if let Some(rest) = current_url.strip_prefix("https://") {
        let (_, path) = rest.split_once('/')?;
        return Some(format!("git@{}:{}", host_alias, path));
    }

    if let Some(rest) = current_url.strip_prefix("http://") {
        let (_, path) = rest.split_once('/')?;
        return Some(format!("git@{}:{}", host_alias, path));
    }

    None
}

fn collect_git_repositories(workspace_path: &Path) -> Result<Vec<PathBuf>, String> {
    let mut repositories = Vec::new();
    collect_git_repositories_recursive(workspace_path, &mut repositories)?;
    repositories.sort();
    repositories.dedup();
    Ok(repositories)
}

fn collect_git_repositories_recursive(
    current_path: &Path,
    repositories: &mut Vec<PathBuf>,
) -> Result<(), String> {
    if !current_path.is_dir() {
        return Ok(());
    }

    if current_path.join(".git").exists() {
        repositories.push(current_path.to_path_buf());
        return Ok(());
    }

    for entry in fs::read_dir(current_path).map_err(|e| format!("扫描工作区目录失败: {}", e))? {
        let entry = entry.map_err(|e| format!("读取工作区子目录失败: {}", e))?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        if path.file_name().and_then(|name| name.to_str()) == Some(".git") {
            continue;
        }

        collect_git_repositories_recursive(&path, repositories)?;
    }

    Ok(())
}

fn combined_output(stdout: &[u8], stderr: &[u8]) -> String {
    let stdout_text = String::from_utf8_lossy(stdout).trim().to_string();
    let stderr_text = String::from_utf8_lossy(stderr).trim().to_string();
    match (stdout_text.is_empty(), stderr_text.is_empty()) {
        (false, false) => format!("{}\n{}", stdout_text, stderr_text),
        (false, true) => stdout_text,
        (true, false) => stderr_text,
        (true, true) => String::new(),
    }
}

fn looks_like_ssh_auth_success(message: &str) -> bool {
    let message = message.to_lowercase();
    message.contains("welcome to codeup")
        || message.contains("successfully authenticated")
        || message.contains("authenticated")
        || message.contains("shell access is not supported")
}

fn ensure_ssh_dir() -> Result<PathBuf, String> {
    let home_dir = dirs::home_dir().ok_or("无法获取用户主目录。")?;
    let ssh_dir = home_dir.join(".ssh");
    if !ssh_dir.exists() {
        fs::create_dir_all(&ssh_dir).map_err(|e| format!("创建 .ssh 目录失败: {}", e))?;
    }
    Ok(ssh_dir)
}

fn app_state_path() -> Result<PathBuf, String> {
    let base_dir = dirs::data_local_dir()
        .or_else(dirs::data_dir)
        .ok_or("无法获取应用数据目录。")?;
    let app_dir = base_dir.join(APP_DIR_NAME);
    if !app_dir.exists() {
        fs::create_dir_all(&app_dir).map_err(|e| format!("创建应用目录失败: {}", e))?;
    }
    Ok(app_dir.join(APP_STATE_FILE))
}

fn read_app_state() -> Result<AppStateFile, String> {
    let state_path = app_state_path()?;
    if !state_path.exists() {
        return Ok(AppStateFile::default());
    }

    let content =
        fs::read_to_string(&state_path).map_err(|e| format!("读取本地状态文件失败: {}", e))?;
    if content.trim().is_empty() {
        return Ok(AppStateFile::default());
    }

    serde_json::from_str(&content).map_err(|e| format!("解析本地状态文件失败: {}", e))
}

fn write_app_state(state: &AppStateFile) -> Result<(), String> {
    let state_path = app_state_path()?;
    let content =
        serde_json::to_string_pretty(state).map_err(|e| format!("序列化本地状态失败: {}", e))?;
    fs::write(state_path, content).map_err(|e| format!("写入本地状态文件失败: {}", e))
}

fn upsert_account_meta(state: &mut AppStateFile, account: AccountMeta) {
    state.accounts.retain(|item| item.host_alias != account.host_alias);
    state.accounts.push(account);
    state.accounts.sort_by(|a, b| a.host_alias.cmp(&b.host_alias));
}

fn ssh_config_path() -> Result<PathBuf, String> {
    Ok(ensure_ssh_dir()?.join("config"))
}

fn read_config_blocks() -> Result<Vec<ConfigBlock>, String> {
    let config_path = ssh_config_path()?;
    if !config_path.exists() {
        return Ok(Vec::new());
    }

    let content =
        fs::read_to_string(config_path).map_err(|e| format!("读取 SSH config 失败: {}", e))?;
    Ok(parse_config_blocks(&content))
}

fn parse_config_blocks(content: &str) -> Vec<ConfigBlock> {
    let lines: Vec<&str> = content.lines().collect();
    let mut blocks = Vec::new();
    let mut block_start: Option<usize> = None;

    for (index, line) in lines.iter().enumerate() {
        if line.trim_start().starts_with("Host ") {
            if let Some(start) = block_start {
                if let Some(block) = parse_block(&lines, start, index) {
                    blocks.push(block);
                }
            }
            block_start = Some(index);
        }
    }

    if let Some(start) = block_start {
        if let Some(block) = parse_block(&lines, start, lines.len()) {
            blocks.push(block);
        }
    }

    blocks
}

fn parse_block(lines: &[&str], host_index: usize, end: usize) -> Option<ConfigBlock> {
    let mut managed = false;
    let mut remove_start = host_index;

    let mut check_index = host_index;
    while check_index > 0 {
        check_index -= 1;
        let trimmed = lines[check_index].trim();
        if trimmed.is_empty() {
            continue;
        }
        if trimmed == MANAGED_MARKER {
            managed = true;
            remove_start = check_index;
        }
        break;
    }

    let host_line = lines.get(host_index)?.trim();
    let host_alias = host_line.strip_prefix("Host ")?.trim().to_string();
    let mut host_name = String::new();
    let mut user = "git".to_string();
    let mut identity_file = String::new();

    for line in lines.iter().take(end).skip(host_index + 1) {
        let trimmed = line.trim();
        if let Some(value) = trimmed.strip_prefix("HostName ") {
            host_name = value.trim().to_string();
        } else if let Some(value) = trimmed.strip_prefix("User ") {
            user = value.trim().to_string();
        } else if let Some(value) = trimmed.strip_prefix("IdentityFile ") {
            identity_file = value.trim().replace('\\', "/");
        }
    }

    Some(ConfigBlock {
        remove_start,
        remove_end: end,
        host_alias,
        host_name,
        user,
        identity_file,
        managed,
    })
}

fn append_config_entry(config: &AccountConfig, key_path: &Path) -> Result<(), String> {
    let config_path = ssh_config_path()?;
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&config_path)
        .map_err(|e| format!("无法打开 config 文件: {}", e))?;

    let needs_leading_newline = config_path.exists()
        && fs::metadata(&config_path)
            .map_err(|e| format!("读取 config 元信息失败: {}", e))?
            .len()
            > 0;

    let config_entry = format!(
        "{}{}\nHost {}\n  HostName {}\n  User {}\n  IdentityFile {}\n  IdentitiesOnly yes\n",
        if needs_leading_newline {
            format!("\n{}\n", MANAGED_MARKER)
        } else {
            format!("{}\n", MANAGED_MARKER)
        },
        "",
        config.host_alias.trim(),
        config.host_name.trim(),
        config.user.trim(),
        normalize_path(key_path)
    );

    file.write_all(config_entry.as_bytes())
        .map_err(|e| format!("写入 config 文件失败: {}", e))
}

fn remove_config_blocks_by_aliases(host_aliases: &[String]) -> Result<(), String> {
    if host_aliases.is_empty() {
        return Ok(());
    }

    let alias_set: HashSet<&str> = host_aliases.iter().map(String::as_str).collect();
    let config_path = ssh_config_path()?;
    if !config_path.exists() {
        return Ok(());
    }

    let content =
        fs::read_to_string(&config_path).map_err(|e| format!("读取 SSH config 失败: {}", e))?;
    let lines: Vec<&str> = content.lines().collect();
    let blocks = parse_config_blocks(&content);
    let remove_ranges = blocks
        .into_iter()
        .filter(|block| alias_set.contains(block.host_alias.as_str()))
        .map(|block| (block.remove_start, block.remove_end))
        .collect::<Vec<_>>();

    if remove_ranges.is_empty() {
        return Ok(());
    }

    let mut next_lines = Vec::new();
    for (index, line) in lines.iter().enumerate() {
        let should_remove = remove_ranges
            .iter()
            .any(|(start, end)| index >= *start && index < *end);
        if !should_remove {
            next_lines.push((*line).to_string());
        }
    }

    let next_content = next_lines.join("\n");
    fs::write(config_path, next_content).map_err(|e| format!("更新 SSH config 失败: {}", e))
}

fn scan_existing_keys(ssh_dir: &Path) -> Result<Vec<PathBuf>, String> {
    let mut keys = Vec::new();
    for entry in fs::read_dir(ssh_dir).map_err(|e| format!("读取 .ssh 目录失败: {}", e))? {
        let entry = entry.map_err(|e| format!("读取 .ssh 文件失败: {}", e))?;
        let path = entry.path();
        if !path.is_file() || should_skip_ssh_file(&path) {
            continue;
        }
        if looks_like_private_key(&path)? {
            keys.push(path);
        }
    }
    Ok(keys)
}

fn should_skip_ssh_file(path: &Path) -> bool {
    let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
        return true;
    };

    matches!(
        name,
        "config" | "known_hosts" | "known_hosts.old" | "authorized_keys"
    ) || name.ends_with(".pub")
}

fn looks_like_private_key(path: &Path) -> Result<bool, String> {
    let content = fs::read(path).map_err(|e| format!("读取密钥文件失败: {}", e))?;
    let preview = String::from_utf8_lossy(&content);
    Ok(preview.contains("PRIVATE KEY"))
}

fn delete_if_exists(path: &Path) -> Result<(), String> {
    if path.exists() {
        fs::remove_file(path).map_err(|e| format!("删除文件失败: {}", e))?;
    }
    Ok(())
}

fn normalize_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn key_name_from_identity_file(identity_file: &str) -> String {
    Path::new(identity_file)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(identity_file)
        .to_string()
}

fn file_name_string(path: &Path) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default()
        .to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            list_dashboard,
            add_account,
            test_ssh_connection,
            scan_workspace_repositories,
            apply_workspace_binding,
            clone_repository,
            delete_account,
            delete_key,
            create_key,
            read_public_key,
            refresh_account_workspaces,
            check_environment
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
