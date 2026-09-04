import { reactive } from "vue";
import { invoke } from "@tauri-apps/api/core";
import type {
  AccountConfig,
  DashboardData,
  EnvironmentStatus,
  ScannedRepository,
  SshTestResult,
} from "./types";

/** 全局仪表盘数据：账号 + 已有密钥。 */
export const dashboard = reactive<DashboardData>({
  managedAccounts: [],
  existingKeys: [],
});

export async function loadDashboard() {
  const data = await invoke<DashboardData>("list_dashboard");
  dashboard.managedAccounts = data.managedAccounts;
  dashboard.existingKeys = data.existingKeys;
}

export function addAccount(config: AccountConfig) {
  return invoke<string>("add_account", { config });
}

export function testSshConnection(config: AccountConfig) {
  return invoke<SshTestResult>("test_ssh_connection", { config });
}

export function scanWorkspaceRepositories(workspacePath: string) {
  return invoke<ScannedRepository[]>("scan_workspace_repositories", { workspacePath });
}

export function cloneRepository(request: {
  hostAlias: string;
  parentDirectory: string;
  gitUrl: string;
  gitUserName: string;
  gitEmail: string;
  directoryName: string | null;
  branch: string | null;
}) {
  return invoke<string>("clone_repository", { request });
}

export function verifyRemoteBranch(gitUrl: string, branch: string) {
  return invoke("verify_remote_branch", { gitUrl, branch });
}

export function deleteAccount(hostAlias: string, deleteKeyFiles: boolean) {
  return invoke<string>("delete_account", { hostAlias, deleteKeyFiles });
}

export function deleteKey(keyName: string) {
  return invoke<string>("delete_key", { keyName });
}

export function createKey(keyName: string, email: string | null) {
  return invoke<string>("create_key", { keyName, email });
}

export function readPublicKey(keyName: string) {
  return invoke<string>("read_public_key", { keyName });
}

export function refreshAccountWorkspaces(hostAlias: string) {
  return invoke<string>("refresh_account_workspaces", { hostAlias });
}

export function checkEnvironment() {
  return invoke<EnvironmentStatus>("check_environment");
}

/** 写入剪贴板，Tauri 的 ClipboardManager 不可用时回退到 DOM API。 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(textarea);
      return ok;
    } catch {
      return false;
    }
  }
}

/** 打开目录选择对话框。 */
export async function pickDirectory(): Promise<string | null> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({ directory: true, multiple: false });
  return typeof selected === "string" ? selected : null;
}
