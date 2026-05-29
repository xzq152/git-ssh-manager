import "./styles.css";

import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

type TabKey = "config" | "accounts" | "keys";
type Platform = "codeup" | "github" | "gitlab" | "custom";
type StatusType = "info" | "success" | "error";
type WorkspaceMode = "existing" | "new";

interface WorkspaceBinding {
  hostAlias: string;
  workspacePath: string;
  gitUserName: string;
  gitEmail: string;
}

interface ManagedAccount {
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

interface ExistingKey {
  keyName: string;
  keyPath: string;
  publicKeyPath: string;
  managedHosts: string[];
  workspacePaths: string[];
}

interface DashboardData {
  managedAccounts: ManagedAccount[];
  existingKeys: ExistingKey[];
}

interface AccountConfig {
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

interface SshTestResult {
  success: boolean;
  message: string;
}

interface ParsedGitUrl {
  protocol: "ssh" | "https";
  host: string;
  namespacePath: string;
  repoName: string;
  fullPath: string;
  detectedPlatform: Platform;
  sshUser?: string;
}

interface ScannedRepository {
  name: string;
  path: string;
  relativePath: string;
  originUrl?: string | null;
}

const PLATFORM_HOST_MAP: Record<Platform, string> = {
  codeup: "codeup.aliyun.com",
  github: "github.com",
  gitlab: "gitlab.com",
  custom: "",
};

const PLATFORM_LABEL_MAP: Record<Platform, string> = {
  codeup: "云效 Codeup",
  github: "GitHub",
  gitlab: "GitLab",
  custom: "自定义",
};

const app = document.querySelector("#app");

if (!app) {
  throw new Error("找不到应用挂载节点");
}

app.innerHTML = `
  <main class="page">
    <section class="tab-shell">
      <div class="tab-bar" role="tablist" aria-label="功能分栏">
        <div class="tab-buttons">
          <button class="tab-button active" data-tab="config" type="button">账号配置</button>
          <button class="tab-button" data-tab="accounts" type="button">已管理账号</button>
          <button class="tab-button" data-tab="keys" type="button">已有密钥</button>
        </div>
        <div class="tab-bar-actions">
          <button class="ghost-button" id="refreshBtn" type="button">刷新数据</button>
        </div>
      </div>

      <section class="tab-panel active" data-panel="config">
        <div class="panel">
          <div class="panel-header">
            <div>
              <h2>账号配置</h2>
              <p>先选平台，再填写 Host 别名。对于云效多账号，真实域名相同，但 Host 别名必须不同。</p>
            </div>
          </div>

          <div class="helper-grid">
            <article class="helper-card">
              <strong>多账号规则</strong>
              <p>同一平台可配置多个账号，但每个账号都要有唯一的 Host 别名，例如 work-account、test-account。</p>
            </article>
            <article class="helper-card">
              <strong>Remote 规则</strong>
              <p>仓库地址要写成 git@别名:命名空间/仓库.git，不要继续直接使用真实域名。</p>
            </article>
          </div>

          <div class="git-url-card">
            <div class="panel-header compact-header">
              <div>
                <h3>Git 地址识别</h3>
                <p>直接粘贴 SSH 或 HTTPS 仓库地址，自动识别平台、域名、命名空间和仓库名。</p>
              </div>
            </div>
            <div class="git-url-row">
              <label class="field git-url-field">
                <span>Git 地址</span>
                <input id="gitUrlInput" type="text" placeholder="例如：git@your-host:group/project.git" />
              </label>
              <button class="secondary-button" id="parseGitUrlBtn" type="button">解析地址</button>
              <button class="ghost-button" id="clearGitUrlBtn" type="button">清空地址</button>
            </div>
            <div class="git-url-result" id="gitUrlResult">粘贴地址后可自动识别命名空间与仓库名。</div>
          </div>

          <div class="grid">
            <label class="field">
              <span>平台类型</span>
              <select id="platformSelect">
                <option value="codeup">云效 Codeup</option>
                <option value="github">GitHub</option>
                <option value="gitlab">GitLab</option>
                <option value="custom">自定义</option>
              </select>
            </label>

            <label class="field">
              <span>Host 别名</span>
              <input id="hostAlias" type="text" placeholder="例如：work-account" />
            </label>

            <label class="field">
              <span>真实域名</span>
              <input id="hostName" type="text" placeholder="例如：codeup.aliyun.com" />
            </label>

            <label class="field">
              <span>SSH 用户</span>
              <input id="sshUser" type="text" value="git" placeholder="例如：git" />
            </label>

            <label class="field">
              <span>密钥文件名</span>
              <input id="keyName" type="text" placeholder="例如：id_work_account" />
            </label>

            <label class="field">
              <span>邮箱</span>
              <input id="email" type="email" placeholder="例如：work@example.com" />
            </label>

            <label class="field">
              <span>Git 用户名</span>
              <input id="gitUserName" type="text" placeholder="例如：张三 / your-name" />
            </label>

            <label class="field">
              <span>平台提示</span>
              <input id="platformHint" type="text" readonly />
            </label>

            <label class="field">
              <span>命名空间</span>
              <input id="namespaceInput" type="text" placeholder="例如：group/subgroup" />
            </label>

            <label class="field">
              <span>仓库名</span>
              <input id="repoNameInput" type="text" placeholder="例如：project.git" />
            </label>
          </div>

          <div class="workspace-row">
            <label class="field workspace-field">
              <span id="workspacePathLabel">工作区文件夹</span>
              <input id="workspacePath" type="text" placeholder="选择父目录也可以，工具会自动扫描其中带 .git 的子项目" readonly />
            </label>
            <button class="secondary-button" id="pickFolderBtn" type="button">选择文件夹</button>
            <button class="ghost-button" id="clearFolderBtn" type="button">清空</button>
          </div>

          <div class="mode-card">
            <div class="panel-header compact-header">
              <div>
                <h3>工作区模式</h3>
                <p>已有仓库模式用于扫描并勾选子仓库；新仓库模式用于选择父目录后直接 clone。</p>
              </div>
            </div>
            <div class="mode-switch" role="tablist" aria-label="工作区模式">
              <button class="mode-button active" id="existingModeBtn" data-mode="existing" type="button">已有仓库</button>
              <button class="mode-button" id="newModeBtn" data-mode="new" type="button">新仓库</button>
            </div>
          </div>

          <div class="repo-scan-card" id="existingRepoSection">
            <div class="panel-header compact-header">
              <div>
                <h3>子仓库扫描</h3>
                <p>先扫描当前工作区下所有带 .git 的子目录，再勾选需要绑定的仓库。</p>
              </div>
            </div>
            <div class="repo-toolbar">
              <button class="secondary-button" id="scanReposBtn" type="button">扫描子仓库</button>
              <button class="ghost-button" id="selectAllReposBtn" type="button">全选</button>
              <button class="ghost-button" id="clearSelectedReposBtn" type="button">清空勾选</button>
            </div>
            <div class="repo-scan-summary" id="repoScanSummary">尚未扫描工作区。</div>
            <div class="repo-list" id="scannedRepos"></div>
          </div>

          <div class="repo-scan-card hidden-section" id="newRepoSection">
            <div class="panel-header compact-header">
              <div>
                <h3>新仓库克隆</h3>
                <p>选择父目录并填写 Git 地址，保存账号后会直接 clone 并自动绑定到新仓库。</p>
              </div>
            </div>
            <div class="repo-scan-summary" id="cloneSummary" data-type="info">将使用上方 Git 地址和当前 Host 别名生成克隆地址。</div>
          </div>

          <label class="checkbox-row">
            <input id="reuseExistingKey" type="checkbox" />
            <span>复用已有密钥，不重新生成</span>
          </label>

          <div class="preview-card">
            <div class="preview-title">Remote 预览</div>
            <code id="remotePreview">git@your-alias:命名空间/仓库.git</code>
          </div>

          <div class="action-row">
            <button class="primary-button" id="saveBtn" type="button">保存账号并绑定工作区</button>
            <button class="secondary-button" id="testBtn" type="button">测试 SSH</button>
            <button class="ghost-button" id="resetBtn" type="button">重置表单</button>
          </div>

          <div class="status-box" id="statusBox" data-type="info">准备就绪</div>
        </div>
      </section>

      <section class="tab-panel" data-panel="accounts">
        <div class="panel">
          <div class="panel-header">
            <div>
              <h2>已管理账号</h2>
              <p>这里展示已经写入 SSH config 的账号，以及它们绑定的工作区。</p>
            </div>
          </div>
          <div id="accountSummary"></div>
          <div class="card-list" id="managedAccounts"></div>
        </div>
      </section>

      <section class="tab-panel" data-panel="keys">
        <div class="panel">
          <div class="panel-header">
            <div>
              <h2>已有密钥</h2>
              <p>扫描 .ssh 下的私钥文件，可直接复用到上方表单，也可删除。</p>
            </div>
          </div>
          <div class="card-list" id="existingKeys"></div>
        </div>
      </section>
    </section>
  </main>
`;

const tabButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".tab-button"));
const tabPanels = Array.from(document.querySelectorAll<HTMLElement>(".tab-panel"));
const platformSelect = document.getElementById("platformSelect") as HTMLSelectElement;
const gitUrlInput = document.getElementById("gitUrlInput") as HTMLInputElement;
const namespaceInput = document.getElementById("namespaceInput") as HTMLInputElement;
const repoNameInput = document.getElementById("repoNameInput") as HTMLInputElement;
const hostAliasInput = document.getElementById("hostAlias") as HTMLInputElement;
const hostNameInput = document.getElementById("hostName") as HTMLInputElement;
const sshUserInput = document.getElementById("sshUser") as HTMLInputElement;
const keyNameInput = document.getElementById("keyName") as HTMLInputElement;
const gitUserNameInput = document.getElementById("gitUserName") as HTMLInputElement;
const emailInput = document.getElementById("email") as HTMLInputElement;
const platformHintInput = document.getElementById("platformHint") as HTMLInputElement;
const workspacePathLabel = document.getElementById("workspacePathLabel") as HTMLSpanElement;
const workspacePathInput = document.getElementById("workspacePath") as HTMLInputElement;
const reuseExistingKeyInput = document.getElementById("reuseExistingKey") as HTMLInputElement;
const remotePreview = document.getElementById("remotePreview") as HTMLElement;
const statusBox = document.getElementById("statusBox") as HTMLDivElement;
const managedAccountsContainer = document.getElementById("managedAccounts") as HTMLDivElement;
const existingKeysContainer = document.getElementById("existingKeys") as HTMLDivElement;
const accountSummary = document.getElementById("accountSummary") as HTMLDivElement;
const gitUrlResult = document.getElementById("gitUrlResult") as HTMLDivElement;
const parseGitUrlBtn = document.getElementById("parseGitUrlBtn") as HTMLButtonElement;
const clearGitUrlBtn = document.getElementById("clearGitUrlBtn") as HTMLButtonElement;
const pickFolderBtn = document.getElementById("pickFolderBtn") as HTMLButtonElement;
const clearFolderBtn = document.getElementById("clearFolderBtn") as HTMLButtonElement;
const scanReposBtn = document.getElementById("scanReposBtn") as HTMLButtonElement;
const selectAllReposBtn = document.getElementById("selectAllReposBtn") as HTMLButtonElement;
const clearSelectedReposBtn = document.getElementById("clearSelectedReposBtn") as HTMLButtonElement;
const repoScanSummary = document.getElementById("repoScanSummary") as HTMLDivElement;
const scannedReposContainer = document.getElementById("scannedRepos") as HTMLDivElement;
const existingModeBtn = document.getElementById("existingModeBtn") as HTMLButtonElement;
const newModeBtn = document.getElementById("newModeBtn") as HTMLButtonElement;
const existingRepoSection = document.getElementById("existingRepoSection") as HTMLDivElement;
const newRepoSection = document.getElementById("newRepoSection") as HTMLDivElement;
const cloneSummary = document.getElementById("cloneSummary") as HTMLDivElement;
const saveBtn = document.getElementById("saveBtn") as HTMLButtonElement;
const testBtn = document.getElementById("testBtn") as HTMLButtonElement;
const resetBtn = document.getElementById("resetBtn") as HTMLButtonElement;
const refreshBtn = document.getElementById("refreshBtn") as HTMLButtonElement;

let dashboardData: DashboardData = {
  managedAccounts: [],
  existingKeys: [],
};
let scannedRepositories: ScannedRepository[] = [];
let selectedRepositoryPaths = new Set<string>();
let workspaceMode: WorkspaceMode = "existing";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function setStatus(message: string, type: StatusType = "info") {
  statusBox.textContent = message;
  statusBox.dataset.type = type;
}

function setTab(tab: TabKey) {
  for (const button of tabButtons) {
    button.classList.toggle("active", button.dataset.tab === tab);
  }
  for (const panel of tabPanels) {
    panel.classList.toggle("active", panel.dataset.panel === tab);
  }
}

function getSelectedPlatform(): Platform {
  return platformSelect.value as Platform;
}

function getPlatformHint(platform: Platform) {
  if (platform === "codeup") {
    return "云效多账号建议使用不同 Host 别名，真实域名固定为 codeup.aliyun.com。";
  }
  if (platform === "github") {
    return "GitHub 默认真实域名为 github.com，可使用多个别名绑定不同密钥。";
  }
  if (platform === "gitlab") {
    return "GitLab 默认真实域名为 gitlab.com，可使用多个别名绑定不同密钥。";
  }
  return "自定义平台可自行填写真实域名，建议仍然使用唯一 Host 别名。";
}

function detectPlatformByHost(host: string): Platform {
  if (host === PLATFORM_HOST_MAP.codeup) {
    return "codeup";
  }
  if (host === PLATFORM_HOST_MAP.github) {
    return "github";
  }
  if (host === PLATFORM_HOST_MAP.gitlab) {
    return "gitlab";
  }
  return "custom";
}

function normalizeRepoName(repoName: string) {
  const trimmed = repoName.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.endsWith(".git") ? trimmed : `${trimmed}.git`;
}

function parseGitUrl(rawValue: string): ParsedGitUrl | null {
  const value = rawValue.trim();
  if (!value) {
    return null;
  }

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

function renderGitUrlResult(parsed: ParsedGitUrl | null, rawValue = "") {
  if (!rawValue.trim()) {
    gitUrlResult.textContent = "粘贴地址后可自动识别命名空间与仓库名。";
    gitUrlResult.dataset.type = "info";
    return;
  }

  if (!parsed) {
    gitUrlResult.textContent = "无法识别当前 Git 地址，请使用完整的 SSH 或 HTTPS 仓库地址。";
    gitUrlResult.dataset.type = "error";
    return;
  }

  gitUrlResult.textContent = `已识别：${platformLabel(parsed.detectedPlatform)} / ${parsed.host} / ${parsed.namespacePath} / ${parsed.repoName}`;
  gitUrlResult.dataset.type = "success";
}

function applyParsedGitUrl(parsed: ParsedGitUrl) {
  platformSelect.value = parsed.detectedPlatform;
  updatePlatformPreset();
  if (parsed.detectedPlatform === "custom") {
    hostNameInput.value = parsed.host;
  }
  namespaceInput.value = parsed.namespacePath;
  repoNameInput.value = parsed.repoName;
  if (parsed.protocol === "ssh" && parsed.sshUser) {
    sshUserInput.value = parsed.sshUser;
  }
  renderGitUrlResult(parsed, gitUrlInput.value);
  updateRemotePreview();
}

function updatePlatformPreset() {
  const platform = getSelectedPlatform();
  const defaultHost = PLATFORM_HOST_MAP[platform];
  const readOnly = platform !== "custom";
  hostNameInput.readOnly = readOnly;
  hostNameInput.classList.toggle("readonly-input", readOnly);
  if (readOnly) {
    hostNameInput.value = defaultHost;
  } else if (!hostNameInput.value.trim()) {
    hostNameInput.value = "";
  }
  platformHintInput.value = getPlatformHint(platform);
  updateRemotePreview();
}

function updateRemotePreview() {
  const alias = hostAliasInput.value.trim() || "your-alias";
  const namespacePath = namespaceInput.value.trim() || "命名空间";
  const repoName = normalizeRepoName(repoNameInput.value) || "仓库.git";
  remotePreview.textContent = `git@${alias}:${namespacePath}/${repoName}`;
  updateCloneSummary();
}

function getParsedCurrentGitPath() {
  return parseGitUrl(gitUrlInput.value)?.fullPath ?? "";
}

function getWorkspaceMode() {
  return workspaceMode;
}

function updateCloneSummary() {
  if (getWorkspaceMode() !== "new") {
    return;
  }

  const alias = hostAliasInput.value.trim() || "your-alias";
  const parsed = parseGitUrl(gitUrlInput.value);
  const workspacePath = workspacePathInput.value.trim();

  if (!workspacePath) {
    cloneSummary.textContent = "请先选择父目录。";
    cloneSummary.dataset.type = "info";
    return;
  }

  if (!parsed) {
    cloneSummary.textContent = "请先输入可识别的 Git 地址，工具会自动转换为别名 remote 后再 clone。";
    cloneSummary.dataset.type = "info";
    return;
  }

  cloneSummary.textContent = `将克隆到：${workspacePath}\n克隆地址：git@${alias}:${parsed.fullPath}`;
  cloneSummary.dataset.type = "success";
}

function setWorkspaceMode(mode: WorkspaceMode) {
  workspaceMode = mode;
  existingModeBtn.classList.toggle("active", mode === "existing");
  newModeBtn.classList.toggle("active", mode === "new");
  existingRepoSection.classList.toggle("hidden-section", mode !== "existing");
  newRepoSection.classList.toggle("hidden-section", mode !== "new");

  if (mode === "existing") {
    workspacePathLabel.textContent = "工作区文件夹";
    workspacePathInput.placeholder = "选择父目录也可以，工具会自动扫描其中带 .git 的子项目";
    saveBtn.textContent = "保存账号并绑定工作区";
  } else {
    workspacePathLabel.textContent = "父目录";
    workspacePathInput.placeholder = "选择一个用于存放新仓库的父目录";
    saveBtn.textContent = "保存账号并克隆新仓库";
  }

  updateCloneSummary();
}

function updateRepoScanSummary() {
  if (getWorkspaceMode() !== "existing") {
    return;
  }

  if (!workspacePathInput.value.trim()) {
    repoScanSummary.textContent = "请先选择一个工作区文件夹。";
    repoScanSummary.dataset.type = "info";
    return;
  }

  if (!scannedRepositories.length) {
    repoScanSummary.textContent = "尚未扫描工作区。";
    repoScanSummary.dataset.type = "info";
    return;
  }

  repoScanSummary.textContent = `已扫描到 ${scannedRepositories.length} 个子 Git 仓库，当前勾选 ${selectedRepositoryPaths.size} 个。`;
  repoScanSummary.dataset.type = "success";
}

function renderScannedRepositories() {
  if (getWorkspaceMode() !== "existing") {
    return;
  }

  updateRepoScanSummary();

  if (!scannedRepositories.length) {
    scannedReposContainer.innerHTML = '<div class="empty-state">扫描后会在这里列出所有子 Git 仓库。</div>';
    return;
  }

  const parsedGitPath = getParsedCurrentGitPath();
  scannedReposContainer.innerHTML = scannedRepositories
    .map((repo) => {
      const checked = selectedRepositoryPaths.has(repo.path) ? "checked" : "";
      const parsedOrigin = repo.originUrl ? parseGitUrl(repo.originUrl)?.fullPath ?? "" : "";
      const matchTag =
        parsedGitPath && parsedOrigin === parsedGitPath
          ? '<span class="mini-tag match-tag">匹配当前 Git 地址</span>'
          : "";

      return `
        <label class="repo-item">
          <div class="repo-item-main">
            <input class="repo-checkbox" type="checkbox" data-repo-path="${escapeHtml(repo.path)}" ${checked} />
            <div class="repo-meta">
              <div class="repo-title-row">
                <strong>${escapeHtml(repo.name)}</strong>
                ${matchTag}
              </div>
              <p>${escapeHtml(repo.relativePath)}</p>
              <code>${escapeHtml(repo.path)}</code>
              <div class="repo-origin">${repo.originUrl ? `origin: ${escapeHtml(repo.originUrl)}` : "origin: 未设置"}</div>
            </div>
          </div>
        </label>
      `;
    })
    .join("");
}

function platformLabel(platform: Platform) {
  return PLATFORM_LABEL_MAP[platform] ?? platform;
}

function buildFormConfig(): AccountConfig {
  return {
    platform: getSelectedPlatform(),
    hostAlias: hostAliasInput.value.trim(),
    hostName: hostNameInput.value.trim(),
    user: sshUserInput.value.trim(),
    email: emailInput.value.trim(),
    keyName: keyNameInput.value.trim(),
    gitUserName: gitUserNameInput.value.trim() || undefined,
    workspacePath: workspacePathInput.value.trim() || undefined,
    reuseExistingKey: reuseExistingKeyInput.checked,
    selectedRepoPaths: Array.from(selectedRepositoryPaths),
  };
}

function resetForm() {
  platformSelect.value = "codeup";
  gitUrlInput.value = "";
  namespaceInput.value = "";
  repoNameInput.value = "";
  hostAliasInput.value = "";
  hostNameInput.value = "";
  sshUserInput.value = "git";
  keyNameInput.value = "";
  emailInput.value = "";
  gitUserNameInput.value = "";
  workspacePathInput.value = "";
  reuseExistingKeyInput.checked = false;
  scannedRepositories = [];
  selectedRepositoryPaths = new Set<string>();
  updatePlatformPreset();
  renderGitUrlResult(null);
  setWorkspaceMode("existing");
  renderScannedRepositories();
}

function fillFormFromAccount(account: ManagedAccount) {
  setTab("config");
  platformSelect.value = account.platform;
  updatePlatformPreset();
  hostAliasInput.value = account.hostAlias;
  hostNameInput.value = account.hostName;
  sshUserInput.value = account.user;
  keyNameInput.value = account.keyName;
  emailInput.value = account.email;
  gitUserNameInput.value = "";
  namespaceInput.value = "";
  repoNameInput.value = "";
  gitUrlInput.value = "";
  workspacePathInput.value = "";
  reuseExistingKeyInput.checked = true;
  scannedRepositories = [];
  selectedRepositoryPaths = new Set<string>();
  renderGitUrlResult(null);
  setWorkspaceMode("existing");
  renderScannedRepositories();
  updateRemotePreview();
  setStatus(`已载入账号 ${account.hostAlias}，可重新绑定工作区或测试 SSH。`, "info");
}

function fillFormFromKey(key: ExistingKey) {
  setTab("config");
  keyNameInput.value = key.keyName;
  reuseExistingKeyInput.checked = true;
  gitUrlInput.value = "";
  scannedRepositories = [];
  selectedRepositoryPaths = new Set<string>();
  renderGitUrlResult(null);
  setWorkspaceMode("existing");
  renderScannedRepositories();
  updateRemotePreview();
  setStatus(`已载入已有密钥 ${key.keyName}，请补全平台、Host 别名和邮箱后保存。`, "info");
}

async function pickWorkspaceFolder() {
  const selected = await open({
    directory: true,
    multiple: false,
  });

  if (typeof selected === "string") {
    workspacePathInput.value = selected;
    scannedRepositories = [];
    selectedRepositoryPaths = new Set<string>();
    renderScannedRepositories();
    updateCloneSummary();
  }
}

async function scanWorkspaceRepositories() {
  const workspacePath = workspacePathInput.value.trim();
  if (!workspacePath) {
    setStatus("请先选择工作区文件夹。", "error");
    return;
  }

  repoScanSummary.dataset.type = "info";
  repoScanSummary.textContent = "正在扫描子 Git 仓库...";

  try {
    const repositories = await invoke<ScannedRepository[]>("scan_workspace_repositories", {
      workspacePath,
    });
    scannedRepositories = repositories;
    selectedRepositoryPaths = new Set(repositories.map((item) => item.path));
    renderScannedRepositories();
    setStatus(
      repositories.length ? `已扫描到 ${repositories.length} 个子 Git 仓库，并默认全部勾选。` : "当前工作区下未发现子 Git 仓库。",
      repositories.length ? "success" : "info",
    );
  } catch (error) {
    scannedRepositories = [];
    selectedRepositoryPaths = new Set<string>();
    renderScannedRepositories();
    setStatus(`扫描失败：${String(error)}`, "error");
  }
}

function renderAccountSummary() {
  const hostGroups = new Map<string, ManagedAccount[]>();
  for (const account of dashboardData.managedAccounts) {
    const list = hostGroups.get(account.hostName) ?? [];
    list.push(account);
    hostGroups.set(account.hostName, list);
  }

  const repeatedHosts = Array.from(hostGroups.entries()).filter(([, accounts]) => accounts.length > 1);

  if (!repeatedHosts.length) {
    accountSummary.innerHTML = "";
    return;
  }

  accountSummary.innerHTML = repeatedHosts
    .map(([hostName, accounts]) => {
      const aliases = accounts.map((item) => `<span class="tag">${escapeHtml(item.hostAlias)}</span>`).join("");
      return `
        <div class="summary-card">
          <strong>${escapeHtml(hostName)}</strong>
          <p>检测到同域名多账号。请确保仓库 remote 使用 Host 别名，而不是直接写真实域名。</p>
          <div class="tag-group">${aliases}</div>
        </div>
      `;
    })
    .join("");
}

function renderManagedAccounts() {
  renderAccountSummary();

  if (!dashboardData.managedAccounts.length) {
    managedAccountsContainer.innerHTML = '<div class="empty-state">还没有已管理账号，先去账号配置里创建一个。</div>';
    return;
  }

  managedAccountsContainer.innerHTML = dashboardData.managedAccounts
    .map((account) => {
      const workspaceHtml = account.workspaces.length
        ? account.workspaces
            .map(
              (workspace) => `
                <li class="workspace-item">
                  <span>${escapeHtml(workspace.workspacePath)}</span>
                  <span class="mini-tag">${escapeHtml(workspace.gitEmail)}</span>
                </li>
              `,
            )
            .join("")
        : '<li class="workspace-item empty-text">还未绑定工作区</li>';

      return `
        <article class="card">
          <div class="card-top">
            <div>
              <h3>${escapeHtml(account.hostAlias)}</h3>
              <p>${escapeHtml(platformLabel(account.platform))} / ${escapeHtml(account.hostName)} / ${escapeHtml(account.user)}</p>
            </div>
            <div class="tag-group">
              <span class="tag">密钥：${escapeHtml(account.keyName)}</span>
              ${account.email ? `<span class="tag">${escapeHtml(account.email)}</span>` : ""}
            </div>
          </div>

          <div class="meta-list">
            <div><strong>私钥：</strong>${escapeHtml(account.keyPath)}</div>
            <div><strong>公钥：</strong>${escapeHtml(account.publicKeyPath)}</div>
            <div><strong>Remote 示例：</strong><code>git@${escapeHtml(account.hostAlias)}:命名空间/仓库.git</code></div>
          </div>

          <div class="workspace-box">
            <strong>工作区绑定</strong>
            <ul class="workspace-list">${workspaceHtml}</ul>
          </div>

          <div class="card-actions">
            <button class="secondary-button" data-action="load-account" data-host-alias="${escapeHtml(account.hostAlias)}" type="button">载入到表单</button>
            <button class="ghost-button danger-text" data-action="delete-account" data-host-alias="${escapeHtml(account.hostAlias)}" data-delete-keys="false" type="button">删除账号</button>
            <button class="ghost-button danger-text" data-action="delete-account" data-host-alias="${escapeHtml(account.hostAlias)}" data-delete-keys="true" type="button">删除账号和密钥</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderExistingKeys() {
  if (!dashboardData.existingKeys.length) {
    existingKeysContainer.innerHTML = '<div class="empty-state">当前没有扫描到私钥文件。</div>';
    return;
  }

  existingKeysContainer.innerHTML = dashboardData.existingKeys
    .map((key) => {
      const hosts = key.managedHosts.length
        ? key.managedHosts.map((host) => `<span class="tag">${escapeHtml(host)}</span>`).join("")
        : '<span class="tag muted-tag">未绑定账号</span>';

      const workspaces = key.workspacePaths.length
        ? key.workspacePaths.map((workspacePath) => `<li class="workspace-item">${escapeHtml(workspacePath)}</li>`).join("")
        : '<li class="workspace-item empty-text">暂无工作区</li>';

      return `
        <article class="card">
          <div class="card-top">
            <div>
              <h3>${escapeHtml(key.keyName)}</h3>
              <p>${escapeHtml(key.keyPath)}</p>
            </div>
            <div class="tag-group">${hosts}</div>
          </div>

          <div class="meta-list">
            <div><strong>公钥：</strong>${escapeHtml(key.publicKeyPath)}</div>
          </div>

          <div class="workspace-box">
            <strong>关联工作区</strong>
            <ul class="workspace-list">${workspaces}</ul>
          </div>

          <div class="card-actions">
            <button class="secondary-button" data-action="use-key" data-key-name="${escapeHtml(key.keyName)}" type="button">复用到表单</button>
            <button class="ghost-button danger-text" data-action="delete-key" data-key-name="${escapeHtml(key.keyName)}" type="button">删除密钥</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderDashboard() {
  renderManagedAccounts();
  renderExistingKeys();
}

async function loadDashboard() {
  dashboardData = await invoke<DashboardData>("list_dashboard");
  renderDashboard();
}

async function saveAccount() {
  setStatus("正在保存账号配置...", "info");
  try {
    const config = buildFormConfig();
    const workspacePath = workspacePathInput.value.trim();
    const selectedPaths = Array.from(selectedRepositoryPaths);

    if (getWorkspaceMode() === "existing") {
      if (workspacePath && !selectedPaths.length) {
        setStatus("请先扫描工作区，并勾选至少一个子 Git 仓库。", "error");
        return;
      }

      if (workspacePath) {
        config.workspacePath = workspacePath;
        config.selectedRepoPaths = selectedPaths;
      } else {
        delete config.workspacePath;
        delete config.selectedRepoPaths;
      }
    } else {
      const parsed = parseGitUrl(gitUrlInput.value);
      if (!workspacePath) {
        setStatus("请先选择父目录。", "error");
        return;
      }
      if (!parsed) {
        setStatus("新仓库模式下必须提供可识别的 Git 地址。", "error");
        return;
      }
      delete config.workspacePath;
      delete config.selectedRepoPaths;
    }

    const result = await invoke<string>("add_account", { config });
    let finalMessage = result;

    if (getWorkspaceMode() === "new") {
      const cloneResult = await invoke<string>("clone_repository", {
        request: {
          hostAlias: config.hostAlias,
          parentDirectory: workspacePath,
          gitUrl: gitUrlInput.value.trim(),
          gitUserName: config.gitUserName ?? "Git SSH Manager",
          gitEmail: config.email,
        },
      });
      finalMessage = `${result}\n${cloneResult}`;
    }

    await loadDashboard();
    setStatus(finalMessage, "success");
    resetForm();
    setTab("accounts");
  } catch (error) {
    setStatus(`保存失败：${String(error)}`, "error");
  }
}

async function testConnection() {
  setStatus("正在测试 SSH 连接...", "info");
  try {
    const result = await invoke<SshTestResult>("test_ssh_connection", {
      config: buildFormConfig(),
    });
    setStatus(result.message, result.success ? "success" : "error");
  } catch (error) {
    setStatus(`测试失败：${String(error)}`, "error");
  }
}

async function removeAccount(hostAlias: string, deleteKeys: boolean) {
  const confirmMessage = deleteKeys
    ? `确认删除账号 ${hostAlias} 以及对应密钥吗？`
    : `确认删除账号 ${hostAlias} 吗？`;

  if (!window.confirm(confirmMessage)) {
    return;
  }

  setStatus("正在删除账号...", "info");

  try {
    const result = await invoke<string>("delete_account", {
      hostAlias,
      deleteKeyFiles: deleteKeys,
    });
    setStatus(result, "success");
    await loadDashboard();
  } catch (error) {
    setStatus(`删除失败：${String(error)}`, "error");
  }
}

async function removeKey(keyName: string) {
  if (!window.confirm(`确认删除密钥 ${keyName} 吗？这会同时移除关联账号。`)) {
    return;
  }

  setStatus("正在删除密钥...", "info");

  try {
    const result = await invoke<string>("delete_key", { keyName });
    setStatus(result, "success");
    await loadDashboard();
  } catch (error) {
    setStatus(`删除失败：${String(error)}`, "error");
  }
}

for (const button of tabButtons) {
  button.addEventListener("click", () => {
    setTab(button.dataset.tab as TabKey);
  });
}

platformSelect.addEventListener("change", () => {
  updatePlatformPreset();
});

gitUrlInput.addEventListener("input", () => {
  renderGitUrlResult(parseGitUrl(gitUrlInput.value), gitUrlInput.value);
  updateCloneSummary();
});

namespaceInput.addEventListener("input", updateRemotePreview);
repoNameInput.addEventListener("input", updateRemotePreview);
hostAliasInput.addEventListener("input", updateRemotePreview);
hostNameInput.addEventListener("input", updateRemotePreview);

parseGitUrlBtn.addEventListener("click", () => {
  const parsed = parseGitUrl(gitUrlInput.value);
  if (!parsed) {
    renderGitUrlResult(null, gitUrlInput.value);
    setStatus("Git 地址解析失败，请检查格式。", "error");
    return;
  }
  applyParsedGitUrl(parsed);
  setStatus("Git 地址已解析并回填到表单。", "success");
});

clearGitUrlBtn.addEventListener("click", () => {
  gitUrlInput.value = "";
  namespaceInput.value = "";
  repoNameInput.value = "";
  renderGitUrlResult(null);
  updateRemotePreview();
});

pickFolderBtn.addEventListener("click", async () => {
  try {
    await pickWorkspaceFolder();
  } catch (error) {
    setStatus(`选择文件夹失败：${String(error)}`, "error");
  }
});

clearFolderBtn.addEventListener("click", () => {
  workspacePathInput.value = "";
  scannedRepositories = [];
  selectedRepositoryPaths = new Set<string>();
  renderScannedRepositories();
  updateCloneSummary();
});

scanReposBtn.addEventListener("click", async () => {
  await scanWorkspaceRepositories();
});

selectAllReposBtn.addEventListener("click", () => {
  selectedRepositoryPaths = new Set(scannedRepositories.map((item) => item.path));
  renderScannedRepositories();
});

clearSelectedReposBtn.addEventListener("click", () => {
  selectedRepositoryPaths = new Set<string>();
  renderScannedRepositories();
});

existingModeBtn.addEventListener("click", () => {
  setWorkspaceMode("existing");
});

newModeBtn.addEventListener("click", () => {
  setWorkspaceMode("new");
});

saveBtn.addEventListener("click", async () => {
  await saveAccount();
});

testBtn.addEventListener("click", async () => {
  await testConnection();
});

resetBtn.addEventListener("click", () => {
  resetForm();
  setStatus("表单已重置。", "info");
});

refreshBtn.addEventListener("click", async () => {
  setStatus("正在刷新列表...", "info");
  try {
    await loadDashboard();
    setStatus("列表已刷新。", "success");
  } catch (error) {
    setStatus(`刷新失败：${String(error)}`, "error");
  }
});

managedAccountsContainer.addEventListener("click", async (event) => {
  const target = event.target as HTMLElement;
  const button = target.closest("button");
  if (!button) {
    return;
  }

  const action = button.dataset.action;
  const hostAlias = button.dataset.hostAlias;

  if (action === "load-account" && hostAlias) {
    const account = dashboardData.managedAccounts.find((item) => item.hostAlias === hostAlias);
    if (account) {
      fillFormFromAccount(account);
    }
  }

  if (action === "delete-account" && hostAlias) {
    await removeAccount(hostAlias, button.dataset.deleteKeys === "true");
  }
});

existingKeysContainer.addEventListener("click", async (event) => {
  const target = event.target as HTMLElement;
  const button = target.closest("button");
  if (!button) {
    return;
  }

  const action = button.dataset.action;
  const keyName = button.dataset.keyName;

  if (action === "use-key" && keyName) {
    const key = dashboardData.existingKeys.find((item) => item.keyName === keyName);
    if (key) {
      fillFormFromKey(key);
    }
  }

  if (action === "delete-key" && keyName) {
    await removeKey(keyName);
  }
});

scannedReposContainer.addEventListener("change", (event) => {
  const target = event.target as HTMLInputElement;
  if (!target.matches(".repo-checkbox")) {
    return;
  }

  const repoPath = target.dataset.repoPath;
  if (!repoPath) {
    return;
  }

  if (target.checked) {
    selectedRepositoryPaths.add(repoPath);
  } else {
    selectedRepositoryPaths.delete(repoPath);
  }
  updateRepoScanSummary();
});

resetForm();
loadDashboard()
  .then(() => {
    setStatus("数据已加载。", "success");
  })
  .catch((error) => {
    setStatus(`初始化失败：${String(error)}`, "error");
  });
