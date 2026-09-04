export type TabKey = "home" | "import" | "accounts";
export type Platform = "codeup" | "github" | "gitlab" | "custom";
export type StatusType = "info" | "success" | "error";

export interface WorkspaceBinding {
  hostAlias: string;
  workspacePath: string;
  gitUserName: string;
  gitEmail: string;
}

export interface ManagedAccount {
  platform: Platform;
  hostAlias: string;
  hostName: string;
  user: string;
  email: string;
  keyName: string;
  keyPath: string;
  publicKeyPath: string;
  workspaces: WorkspaceBinding[];
}

export interface ExistingKey {
  keyName: string;
  keyPath: string;
  publicKeyPath: string;
  managedHosts: string[];
  workspacePaths: string[];
}

export interface DashboardData {
  managedAccounts: ManagedAccount[];
  existingKeys: ExistingKey[];
}

export interface AccountConfig {
  platform: Platform;
  hostAlias: string;
  hostName: string;
  user: string;
  email: string;
  keyName: string;
  workspacePath?: string;
  gitUserName?: string;
  reuseExistingKey?: boolean;
  selectedRepoPaths?: string[];
}

export interface SshTestResult {
  success: boolean;
  message: string;
}

export interface EnvironmentStatus {
  gitAvailable: boolean;
  gitVersion: string | null;
  hasSshKeys: boolean;
  sshDir: string;
}

export interface ParsedGitUrl {
  protocol: "ssh" | "https";
  host: string;
  namespacePath: string;
  repoName: string;
  fullPath: string;
  detectedPlatform: Platform;
  sshUser?: string;
}

export interface ScannedRepository {
  name: string;
  path: string;
  relativePath: string;
  originUrl?: string | null;
}

export const PLATFORM_HOST_MAP: Record<Platform, string> = {
  codeup: "codeup.aliyun.com",
  github: "github.com",
  gitlab: "gitlab.com",
  custom: "",
};

export const PLATFORM_LABEL_MAP: Record<Platform, string> = {
  codeup: "云效 Codeup",
  github: "GitHub",
  gitlab: "GitLab",
  custom: "自定义",
};

export function platformLabel(platform: Platform) {
  return PLATFORM_LABEL_MAP[platform] ?? platform;
}

export function detectPlatformByHost(host: string): Platform {
  if (host === PLATFORM_HOST_MAP.codeup) return "codeup";
  if (host === PLATFORM_HOST_MAP.github) return "github";
  if (host === PLATFORM_HOST_MAP.gitlab) return "gitlab";
  return "custom";
}

/** 解析 SSH / HTTPS 形式的 Git 地址，无法识别时返回 null。 */
export function parseGitUrl(rawValue: string): ParsedGitUrl | null {
  const value = rawValue.trim();
  if (!value) return null;

  const sshMatch = value.match(/^([^@]+)@([^:]+):(.+)$/);
  if (sshMatch) {
    const [, sshUser, host, path] = sshMatch;
    const cleanedPath = path.replace(/^\/+/, "").replace(/\/+$/, "");
    const segments = cleanedPath.split("/").filter(Boolean);
    if (segments.length >= 2) {
      const repoName = segments[segments.length - 1] ?? "";
      const namespacePath = segments.slice(0, -1).join("/");
      return {
        protocol: "ssh",
        sshUser,
        host,
        namespacePath,
        repoName,
        fullPath: cleanedPath,
        detectedPlatform: detectPlatformByHost(host),
      };
    }
  }

  try {
    const url = new URL(value);
    const host = url.hostname;
    const cleanedPath = url.pathname.replace(/^\/+/, "").replace(/\/+$/, "");
    const segments = cleanedPath.split("/").filter(Boolean);
    if (segments.length >= 2) {
      const repoName = segments[segments.length - 1] ?? "";
      const namespacePath = segments.slice(0, -1).join("/");
      return {
        protocol: "https",
        host,
        namespacePath,
        repoName,
        fullPath: cleanedPath,
        detectedPlatform: detectPlatformByHost(host),
      };
    }
  } catch {
    return null;
  }

  return null;
}
