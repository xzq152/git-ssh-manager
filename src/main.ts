import "./styles.css";

import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";

type TabKey = "home" | "import" | "accounts";
type Platform = "codeup" | "github" | "gitlab" | "custom";
type StatusType = "info" | "success" | "error";

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

interface EnvironmentStatus {
  gitAvailable: boolean;
  gitVersion: string | null;
  hasSshKeys: boolean;
  sshDir: string;
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
  <header class="titlebar" data-tauri-drag-region>
    <div class="titlebar-brand" data-tauri-drag-region>
      <svg class="titlebar-icon" data-tauri-drag-region viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="8" cy="15" r="4"></circle>
        <path d="M10.85 12.15 19 4"></path>
        <path d="M18 5l2 2"></path>
        <path d="M15 8l2 2"></path>
      </svg>
      <span class="titlebar-title" data-tauri-drag-region>Git密钥管理器</span>
    </div>
    <div class="titlebar-controls">
      <button class="window-button" id="windowMinBtn" type="button" aria-label="最小化">
        <svg viewBox="0 0 10 10" aria-hidden="true"><line x1="0" y1="5" x2="10" y2="5" stroke="currentColor" stroke-width="1.2" /></svg>
      </button>
      <button class="window-button" id="windowMaxBtn" type="button" aria-label="最大化">
        <svg class="icon-maximize" viewBox="0 0 10 10" aria-hidden="true"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1.2" /></svg>
        <svg class="icon-restore" viewBox="0 0 10 10" aria-hidden="true"><path d="M2.5 0.5 H9.5 V7.5 M0.5 0.5 H7.5 V7.5 H0.5 Z" fill="none" stroke="currentColor" stroke-width="1.2" /></svg>
      </button>
      <button class="window-button window-close" id="windowCloseBtn" type="button" aria-label="关闭">
        <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M0.5 0.5 L9.5 9.5 M9.5 0.5 L0.5 9.5" stroke="currentColor" stroke-width="1.2" /></svg>
      </button>
    </div>
  </header>

  <div class="layout">
    <aside class="sidebar">
      <nav class="sidebar-menu" role="tablist" aria-label="功能菜单">
        <button class="sidebar-item active" data-tab="home" type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9"></circle>
            <path d="M12 8h.01M11 12h1v5h1"></path>
          </svg>
          <span>使用说明</span>
        </button>
        <button class="sidebar-item" data-tab="import" type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 3v12"></path>
            <path d="m7 10 5 5 5-5"></path>
            <path d="M4 21h16"></path>
          </svg>
          <span>快速导入</span>
        </button>
        <button class="sidebar-item" data-tab="accounts" type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="7.5" r="4"></circle>
            <path d="M4.5 20.5c0-4.2 3.4-6.5 7.5-6.5s7.5 2.3 7.5 6.5"></path>
          </svg>
          <span>账号与密钥</span>
        </button>
      </nav>
      <div class="sidebar-footer">
        <button class="ghost-button sidebar-refresh" id="refreshBtn" type="button">刷新数据</button>
      </div>
    </aside>

    <main class="content">

      <section class="tab-panel active" data-panel="home">
        <div class="panel">
          <div class="panel-header">
            <div>
              <h2>欢迎使用 Git密钥管理器</h2>
              <p>一站式管理 Git SSH 多账号、工作区绑定与仓库克隆。</p>
            </div>
          </div>

          <div class="helper-grid">
            <article class="helper-card">
              <strong>① 准备密钥</strong>
              <p>在「账号与密钥」页创建新密钥，或复用 ~/.ssh 下已有的密钥；把公钥复制到 GitHub、云效、GitLab 等平台。</p>
            </article>
            <article class="helper-card">
              <strong>② 新建账号</strong>
              <p>在「账号与密钥」页新建账号：选择平台、填写唯一 Host 别名、密钥文件名与邮箱，保存后自动写入 SSH config。</p>
            </article>
            <article class="helper-card">
              <strong>③ 绑定仓库</strong>
              <p>选择工作区扫描子仓库并勾选，自动写入 user.name / user.email，并把 origin 改写为 git@别名 地址。</p>
            </article>
            <article class="helper-card">
              <strong>④ 快速导入</strong>
              <p>在「快速导入」页粘贴仓库地址、选择账号、自定义文件夹名，一键完成克隆并绑定。</p>
            </article>
          </div>

          <div class="preview-card">
            <div class="preview-title">多账号规则</div>
            <p>同一平台可配置多个账号，但每个账号必须使用唯一的 Host 别名（如 work-account、test-account）。仓库 remote 应写成 <code>git@别名:命名空间/仓库.git</code>，而不是真实域名。</p>
          </div>

          <div class="preview-card">
            <div class="preview-title">注意事项</div>
            <p>删除账号会移除其 SSH config 块与工作区绑定记录；「删除账号和密钥」还会删除磁盘上的密钥文件，请谨慎操作。工作区内新增仓库后，可在「已管理账号」中点击该账号的「刷新」自动绑定。</p>
          </div>
        </div>
      </section>

      <section class="tab-panel" data-panel="accounts">
        <div class="panel">
          <div class="panel-header">
            <div>
              <h2>账号与密钥</h2>
              <p>先检查 ~/.ssh 下已有的密钥，再管理账号与工作区绑定。</p>
            </div>
          </div>

          <div class="merged-section-header">
            <div>
              <h3>已有密钥</h3>
              <p>扫描 .ssh 下的私钥文件，可查看、复制公钥并执行删除。</p>
            </div>
            <button class="primary-button" id="createKeyOpenBtn" type="button">创建新密钥</button>
          </div>

          <div class="status-box" id="keysStatusBox" data-type="info">准备就绪</div>

          <div class="table-wrap">
            <table class="keys-table">
              <thead>
                <tr>
                  <th>密钥名</th>
                  <th>私钥路径</th>
                  <th>公钥路径</th>
                  <th>关联账号</th>
                  <th>绑定仓库</th>
                  <th class="col-actions">操作</th>
                </tr>
              </thead>
              <tbody id="existingKeys"></tbody>
            </table>
          </div>

          <div class="merged-section-header">
            <div>
              <h3>已管理账号</h3>
              <p>展示已写入 SSH config 的账号，点击「详情」可展开查看完整信息。</p>
            </div>
            <button class="primary-button" id="newAccountBtn" type="button">新建账号</button>
          </div>

          <div id="accountSummary"></div>
          <div class="status-box dismissible hidden-section" id="accountsStatusBox" data-type="info">
            <span class="status-message" id="accountsStatusMessage"></span>
            <button class="status-close-btn" id="accountsStatusClose" type="button" aria-label="关闭提示">✕</button>
          </div>
          <div class="table-wrap">
            <table class="keys-table">
              <thead>
                <tr>
                  <th>别名</th>
                  <th>平台</th>
                  <th>域名</th>
                  <th>账号</th>
                  <th>邮箱</th>
                  <th>工作区</th>
                  <th class="col-actions">操作</th>
                </tr>
              </thead>
              <tbody id="managedAccounts"></tbody>
            </table>
          </div>
        </div>
      </section>

      <section class="tab-panel" data-panel="import">
        <div class="panel">
          <div class="panel-header">
            <div>
              <h2>快速导入仓库</h2>
              <p>粘贴仓库地址，选择已管理的账号，即可用该账号的 Host 别名克隆到本地。</p>
            </div>
          </div>

          <div class="grid">
            <label class="field">
              <span>Git 地址</span>
              <input id="importGitUrl" type="text" placeholder="例如：git@your-host:group/project.git" />
            </label>
            <label class="field">
              <span>使用账号</span>
              <select id="importAccountSelect">
                <option value="">-- 请选择账号 --</option>
              </select>
            </label>
          </div>

          <div class="workspace-row">
            <label class="field workspace-field">
              <span>父目录</span>
              <input id="importParentDir" type="text" placeholder="选择存放新仓库的父目录" readonly />
            </label>
            <button class="secondary-button" id="importPickDirBtn" type="button">选择文件夹</button>
          </div>

          <div class="grid">
            <label class="field">
              <span>文件夹名称</span>
              <input id="importDirName" type="text" placeholder="留空则使用仓库名" />
            </label>
            <label class="field">
              <span>分支（可选）</span>
              <input id="importBranch" type="text" placeholder="留空则克隆仓库默认分支" />
            </label>
          </div>

          <div class="preview-card">
            <div class="preview-title">克隆地址预览</div>
            <code id="importRemotePreview">选择账号并输入地址后显示。</code>
          </div>

          <div class="action-row">
            <button class="primary-button" id="importCloneBtn" type="button">开始克隆</button>
            <button class="ghost-button" id="importResetBtn" type="button">重置</button>
          </div>

          <div class="status-box" id="importStatusBox" data-type="info">准备就绪</div>
        </div>
      </section>
    </main>
  </div>

  <div class="modal-overlay hidden-section" id="createKeyModal">
    <div class="modal" role="dialog" aria-modal="true" aria-label="创建新密钥">
      <div class="modal-header">
        <h3>创建新密钥</h3>
        <button class="modal-close-btn" id="createKeyModalClose" type="button" aria-label="关闭">✕</button>
      </div>
      <div class="modal-body">
        <label class="field">
          <span>密钥文件名</span>
          <input id="createKeyName" type="text" placeholder="例如：id_work_account" />
        </label>
        <label class="field">
          <span>注释邮箱（可选）</span>
          <input id="createKeyEmail" type="email" placeholder="例如：work@example.com" />
        </label>
      </div>
      <div class="modal-footer">
        <button class="ghost-button" id="createKeyModalCancel" type="button">取消</button>
        <button class="primary-button" id="createKeyBtn" type="button">创建密钥</button>
      </div>
    </div>
  </div>

  <div class="modal-overlay hidden-section" id="deleteAccountModal">
    <div class="modal" role="dialog" aria-modal="true" aria-label="删除账号">
      <div class="modal-header">
        <h3>删除账号</h3>
        <button class="modal-close-btn" id="deleteAccountModalClose" type="button" aria-label="关闭">✕</button>
      </div>
      <div class="modal-body">
        <p class="modal-text" id="deleteAccountModalText"></p>
        <label class="checkbox-row">
          <input id="deleteAccountDeleteKeys" type="checkbox" />
          <span id="deleteAccountDeleteKeysLabel"></span>
        </label>
      </div>
      <div class="modal-footer">
        <button class="ghost-button" id="deleteAccountModalCancel" type="button">取消</button>
        <button class="danger-button" id="deleteAccountModalConfirm" type="button">删除</button>
      </div>
    </div>
  </div>

  <div class="modal-overlay hidden-section" id="envModal">
    <div class="modal" role="dialog" aria-modal="true" aria-label="环境检查">
      <div class="modal-header">
        <h3 id="envModalTitle">环境检查</h3>
        <button class="modal-close-btn" id="envModalClose" type="button" aria-label="关闭">✕</button>
      </div>
      <div class="modal-body">
        <p class="modal-text" id="envModalText"></p>
      </div>
      <div class="modal-footer">
        <button class="ghost-button hidden-section" id="envModalSecondary" type="button">稍后再说</button>
        <button class="primary-button" id="envModalPrimary" type="button">知道了</button>
      </div>
    </div>
  </div>

  <div class="drawer-overlay hidden-section" id="accountDrawer">
    <div class="drawer" role="dialog" aria-modal="true" aria-label="账号表单">
      <div class="drawer-header">
        <h3 id="accountFormTitle">新建账号</h3>
        <button class="modal-close-btn" id="drawerCloseBtn" type="button" aria-label="关闭">✕</button>
      </div>
      <div class="drawer-body">
        <p class="drawer-desc">先选平台，再填写 Host 别名。对于云效多账号，真实域名相同，但 Host 别名必须不同。</p>

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
            <span>使用密钥</span>
            <div class="key-select-row">
              <select id="keySelect"></select>
              <button class="secondary-button" id="formCreateKeyBtn" type="button">新建密钥</button>
            </div>
          </label>

          <label class="field">
            <span>邮箱</span>
            <input id="email" type="email" placeholder="例如：work@example.com" />
          </label>

          <label class="field">
            <span>Git 用户名</span>
            <input id="gitUserName" type="text" placeholder="例如：张三 / your-name" />
          </label>
        </div>

        <p class="field-hint" id="platformHint"></p>

        <div class="workspace-row">
          <label class="field workspace-field">
            <span>工作区文件夹</span>
            <input id="workspacePath" type="text" placeholder="选择父目录也可以，工具会自动扫描其中带 .git 的子项目" readonly />
          </label>
          <button class="secondary-button" id="pickFolderBtn" type="button">选择文件夹</button>
          <button class="ghost-button" id="clearFolderBtn" type="button">清空</button>
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

        <div class="preview-card">
          <div class="preview-title">Remote 预览</div>
          <code id="remotePreview">git@your-alias:命名空间/仓库.git</code>
        </div>

        <div class="status-box" id="statusBox" data-type="info">准备就绪</div>
      </div>
      <div class="drawer-footer">
        <button class="ghost-button" id="cancelAccountFormBtn" type="button">取消</button>
        <button class="secondary-button" id="testBtn" type="button">测试 SSH</button>
        <button class="primary-button" id="saveBtn" type="button">保存账号并绑定工作区</button>
      </div>
    </div>
  </div>
`;

const tabButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".sidebar-item"));
const tabPanels = Array.from(document.querySelectorAll<HTMLElement>(".tab-panel"));
const platformSelect = document.getElementById("platformSelect") as HTMLSelectElement;
const hostAliasInput = document.getElementById("hostAlias") as HTMLInputElement;
const hostNameInput = document.getElementById("hostName") as HTMLInputElement;
const sshUserInput = document.getElementById("sshUser") as HTMLInputElement;
const keySelect = document.getElementById("keySelect") as HTMLSelectElement;
const gitUserNameInput = document.getElementById("gitUserName") as HTMLInputElement;
const emailInput = document.getElementById("email") as HTMLInputElement;
const platformHintInput = document.getElementById("platformHint") as HTMLElement;
const workspacePathInput = document.getElementById("workspacePath") as HTMLInputElement;
const remotePreview = document.getElementById("remotePreview") as HTMLElement;
const statusBox = document.getElementById("statusBox") as HTMLDivElement;
const managedAccountsContainer = document.getElementById("managedAccounts") as HTMLTableSectionElement;
const existingKeysContainer = document.getElementById("existingKeys") as HTMLTableSectionElement;
const accountSummary = document.getElementById("accountSummary") as HTMLDivElement;
const newAccountBtn = document.getElementById("newAccountBtn") as HTMLButtonElement;
const accountDrawer = document.getElementById("accountDrawer") as HTMLDivElement;
const accountFormTitle = document.getElementById("accountFormTitle") as HTMLHeadingElement;
const drawerCloseBtn = document.getElementById("drawerCloseBtn") as HTMLButtonElement;
const cancelAccountFormBtn = document.getElementById("cancelAccountFormBtn") as HTMLButtonElement;
const pickFolderBtn = document.getElementById("pickFolderBtn") as HTMLButtonElement;
const clearFolderBtn = document.getElementById("clearFolderBtn") as HTMLButtonElement;
const scanReposBtn = document.getElementById("scanReposBtn") as HTMLButtonElement;
const selectAllReposBtn = document.getElementById("selectAllReposBtn") as HTMLButtonElement;
const clearSelectedReposBtn = document.getElementById("clearSelectedReposBtn") as HTMLButtonElement;
const repoScanSummary = document.getElementById("repoScanSummary") as HTMLDivElement;
const scannedReposContainer = document.getElementById("scannedRepos") as HTMLDivElement;
const saveBtn = document.getElementById("saveBtn") as HTMLButtonElement;
const testBtn = document.getElementById("testBtn") as HTMLButtonElement;
const refreshBtn = document.getElementById("refreshBtn") as HTMLButtonElement;
const windowMinBtn = document.getElementById("windowMinBtn") as HTMLButtonElement;
const windowMaxBtn = document.getElementById("windowMaxBtn") as HTMLButtonElement;
const windowCloseBtn = document.getElementById("windowCloseBtn") as HTMLButtonElement;
const titlebar = document.querySelector(".titlebar") as HTMLElement;
const appWindow = getCurrentWindow();
const importGitUrlInput = document.getElementById("importGitUrl") as HTMLInputElement;
const importAccountSelect = document.getElementById("importAccountSelect") as HTMLSelectElement;
const importParentDirInput = document.getElementById("importParentDir") as HTMLInputElement;
const importDirNameInput = document.getElementById("importDirName") as HTMLInputElement;
const importBranchInput = document.getElementById("importBranch") as HTMLInputElement;
const importPickDirBtn = document.getElementById("importPickDirBtn") as HTMLButtonElement;
const importRemotePreview = document.getElementById("importRemotePreview") as HTMLElement;
const importCloneBtn = document.getElementById("importCloneBtn") as HTMLButtonElement;
const importResetBtn = document.getElementById("importResetBtn") as HTMLButtonElement;
const importStatusBox = document.getElementById("importStatusBox") as HTMLDivElement;
const createKeyNameInput = document.getElementById("createKeyName") as HTMLInputElement;
const createKeyEmailInput = document.getElementById("createKeyEmail") as HTMLInputElement;
const createKeyBtn = document.getElementById("createKeyBtn") as HTMLButtonElement;
const keysStatusBox = document.getElementById("keysStatusBox") as HTMLDivElement;
const createKeyOpenBtn = document.getElementById("createKeyOpenBtn") as HTMLButtonElement;
const formCreateKeyBtn = document.getElementById("formCreateKeyBtn") as HTMLButtonElement;
const createKeyModal = document.getElementById("createKeyModal") as HTMLDivElement;
const createKeyModalClose = document.getElementById("createKeyModalClose") as HTMLButtonElement;
const createKeyModalCancel = document.getElementById("createKeyModalCancel") as HTMLButtonElement;
const accountsStatusBox = document.getElementById("accountsStatusBox") as HTMLDivElement;
const accountsStatusMessage = document.getElementById("accountsStatusMessage") as HTMLSpanElement;
const accountsStatusClose = document.getElementById("accountsStatusClose") as HTMLButtonElement;
const deleteAccountModal = document.getElementById("deleteAccountModal") as HTMLDivElement;
const deleteAccountModalClose = document.getElementById("deleteAccountModalClose") as HTMLButtonElement;
const deleteAccountModalCancel = document.getElementById("deleteAccountModalCancel") as HTMLButtonElement;
const deleteAccountModalConfirm = document.getElementById("deleteAccountModalConfirm") as HTMLButtonElement;
const deleteAccountModalText = document.getElementById("deleteAccountModalText") as HTMLParagraphElement;
const deleteAccountDeleteKeys = document.getElementById("deleteAccountDeleteKeys") as HTMLInputElement;
const deleteAccountDeleteKeysLabel = document.getElementById("deleteAccountDeleteKeysLabel") as HTMLSpanElement;
const envModal = document.getElementById("envModal") as HTMLDivElement;
const envModalTitle = document.getElementById("envModalTitle") as HTMLHeadingElement;
const envModalText = document.getElementById("envModalText") as HTMLParagraphElement;
const envModalPrimary = document.getElementById("envModalPrimary") as HTMLButtonElement;
const envModalSecondary = document.getElementById("envModalSecondary") as HTMLButtonElement;
const envModalClose = document.getElementById("envModalClose") as HTMLButtonElement;
let pendingDeleteAlias = "";

let dashboardData: DashboardData = {
  managedAccounts: [],
  existingKeys: [],
};
let scannedRepositories: ScannedRepository[] = [];
let selectedRepositoryPaths = new Set<string>();
let expandedAccountAliases = new Set<string>();

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
  platformHintInput.textContent = getPlatformHint(platform);
  updateRemotePreview();
}

function updateRemotePreview() {
  const alias = hostAliasInput.value.trim() || "your-alias";
  remotePreview.textContent = `git@${alias}:命名空间/仓库.git`;
}

function updateRepoScanSummary() {
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
  updateRepoScanSummary();

  if (!scannedRepositories.length) {
    scannedReposContainer.innerHTML = '<div class="empty-state">扫描后会在这里列出所有子 Git 仓库。</div>';
    return;
  }

  scannedReposContainer.innerHTML = scannedRepositories
    .map((repo) => {
      const checked = selectedRepositoryPaths.has(repo.path) ? "checked" : "";

      return `
        <label class="repo-item">
          <div class="repo-item-main">
            <input class="repo-checkbox" type="checkbox" data-repo-path="${escapeHtml(repo.path)}" ${checked} />
            <div class="repo-meta">
              <div class="repo-title-row">
                <strong>${escapeHtml(repo.name)}</strong>
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
    keyName: keySelect.value.trim(),
    gitUserName: gitUserNameInput.value.trim() || undefined,
    workspacePath: workspacePathInput.value.trim() || undefined,
    reuseExistingKey: true,
    selectedRepoPaths: Array.from(selectedRepositoryPaths),
  };
}

function renderKeySelect(selectedKeyName = "") {
  const keys = dashboardData.existingKeys;
  const options = keys.map(
    (key) => `<option value="${escapeHtml(key.keyName)}">${escapeHtml(key.keyName)}</option>`,
  );
  if (selectedKeyName && !keys.some((key) => key.keyName === selectedKeyName)) {
    options.unshift(
      `<option value="${escapeHtml(selectedKeyName)}">${escapeHtml(selectedKeyName)}（文件缺失）</option>`,
    );
  }
  if (!options.length) {
    options.push('<option value="">（暂无密钥，请先新建）</option>');
  }
  keySelect.innerHTML = options.join("");
  keySelect.value = selectedKeyName || keys[0]?.keyName || "";
}

function resetForm() {
  platformSelect.value = "codeup";
  hostAliasInput.value = "";
  hostNameInput.value = "";
  sshUserInput.value = "git";
  emailInput.value = "";
  gitUserNameInput.value = "";
  workspacePathInput.value = "";
  scannedRepositories = [];
  selectedRepositoryPaths = new Set<string>();
  renderKeySelect();
  updatePlatformPreset();
  renderScannedRepositories();
}

function openAccountForm(account?: ManagedAccount) {
  if (account) {
    accountFormTitle.textContent = `编辑账号 ${account.hostAlias}`;
    platformSelect.value = account.platform;
    updatePlatformPreset();
    hostAliasInput.value = account.hostAlias;
    hostNameInput.value = account.hostName;
    sshUserInput.value = account.user;
    renderKeySelect(account.keyName);
    emailInput.value = account.email;
    gitUserNameInput.value = "";
    workspacePathInput.value = "";
    scannedRepositories = [];
    selectedRepositoryPaths = new Set<string>();
    renderScannedRepositories();
    updateRemotePreview();
    setStatus(`已载入账号 ${account.hostAlias}，可重新绑定工作区或测试 SSH。`, "info");
  } else {
    resetForm();
    accountFormTitle.textContent = "新建账号";
  }
  accountDrawer.classList.remove("hidden-section");
  hostAliasInput.focus();
}

function closeAccountForm() {
  accountDrawer.classList.add("hidden-section");
  resetForm();
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

function renderAccountDetailRow(account: ManagedAccount) {
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
    <tr class="detail-row">
      <td colspan="7">
        <div class="account-detail">
          <div class="detail-grid">
            <div><strong>平台：</strong>${escapeHtml(platformLabel(account.platform))}</div>
            <div><strong>HostName：</strong>${escapeHtml(account.hostName)}</div>
            <div><strong>SSH 用户：</strong>${escapeHtml(account.user)}</div>
            <div><strong>邮箱：</strong>${account.email ? escapeHtml(account.email) : '<span class="muted-text">未填写</span>'}</div>
            <div><strong>密钥名：</strong>${escapeHtml(account.keyName)}</div>
            <div><strong>私钥：</strong>${escapeHtml(account.keyPath)}</div>
            <div><strong>公钥：</strong>${escapeHtml(account.publicKeyPath)}</div>
          </div>

          <div class="detail-block">
            <strong>Remote 示例</strong>
            <code>git@${escapeHtml(account.hostAlias)}:命名空间/仓库.git</code>
          </div>

          <div class="detail-block">
            <strong>工作区绑定</strong>
            <ul class="workspace-list">${workspaceHtml}</ul>
          </div>
        </div>
      </td>
    </tr>
  `;
}

function renderManagedAccounts() {
  renderAccountSummary();

  if (!dashboardData.managedAccounts.length) {
    managedAccountsContainer.innerHTML =
      '<tr><td colspan="7" class="table-empty">还没有账号，点击「新建账号」创建一个。</td></tr>';
    return;
  }

  managedAccountsContainer.innerHTML = dashboardData.managedAccounts
    .map((account) => {
      const expanded = expandedAccountAliases.has(account.hostAlias);
      const detailRow = expanded ? renderAccountDetailRow(account) : "";
      return `
        <tr>
          <td><strong>${escapeHtml(account.hostAlias)}</strong></td>
          <td>${escapeHtml(platformLabel(account.platform))}</td>
          <td>${escapeHtml(account.hostName)}</td>
          <td>${escapeHtml(account.user)}</td>
          <td>${account.email ? escapeHtml(account.email) : '<span class="muted-text">未填写</span>'}</td>
          <td>${account.workspaces.length ? `<span class="tag">${account.workspaces.length} 个</span>` : '<span class="muted-text">未绑定</span>'}</td>
          <td class="cell-actions">
            <button class="table-btn" data-action="toggle-detail" data-host-alias="${escapeHtml(account.hostAlias)}" type="button">${expanded ? "收起" : "详情"}</button>
            <button class="table-btn" data-action="load-account" data-host-alias="${escapeHtml(account.hostAlias)}" type="button">编辑</button>
            <button class="table-btn" data-action="refresh-workspaces" data-host-alias="${escapeHtml(account.hostAlias)}" type="button">刷新</button>
            <button class="table-btn table-btn-danger" data-action="delete-account" data-host-alias="${escapeHtml(account.hostAlias)}" type="button">删除</button>
          </td>
        </tr>
        ${detailRow}
      `;
    })
    .join("");
}

function renderExistingKeys() {
  if (!dashboardData.existingKeys.length) {
    existingKeysContainer.innerHTML =
      '<tr><td colspan="6" class="table-empty">当前没有扫描到私钥文件，可点击「创建新密钥」。</td></tr>';
    return;
  }

  existingKeysContainer.innerHTML = dashboardData.existingKeys
    .map((key) => {
      const hosts = key.managedHosts.length
        ? key.managedHosts.map((host) => `<span class="tag">${escapeHtml(host)}</span>`).join("")
        : '<span class="tag muted-tag">未绑定账号</span>';
      const workspaces = key.workspacePaths.length
        ? key.workspacePaths.map((path) => `<div class="key-workspace-path">${escapeHtml(path)}</div>`).join("")
        : '<span class="muted-text">未绑定仓库</span>';

      return `
        <tr>
          <td><strong>${escapeHtml(key.keyName)}</strong></td>
          <td class="cell-path" title="${escapeHtml(key.keyPath)}">${escapeHtml(key.keyPath)}</td>
          <td class="cell-path" title="${escapeHtml(key.publicKeyPath)}">${escapeHtml(key.publicKeyPath)}</td>
          <td><div class="tag-group">${hosts}</div></td>
          <td><div class="key-workspace-list">${workspaces}</div></td>
          <td class="cell-actions">
            <button class="table-btn" data-action="copy-key" data-key-name="${escapeHtml(key.keyName)}" type="button">复制公钥</button>
            <button class="table-btn table-btn-danger" data-action="delete-key" data-key-name="${escapeHtml(key.keyName)}" type="button">删除</button>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderDashboard() {
  renderExistingKeys();
  renderManagedAccounts();
  renderImportAccountOptions();
  renderKeySelect();
}

function setImportStatus(message: string, type: StatusType = "info") {
  importStatusBox.textContent = message;
  importStatusBox.dataset.type = type;
}

function renderImportAccountOptions() {
  const accounts = dashboardData.managedAccounts;
  const hasAccounts = accounts.length > 0;
  importAccountSelect.innerHTML = hasAccounts
    ? accounts
        .map(
          (account) =>
            `<option value="${escapeHtml(account.hostAlias)}">${escapeHtml(account.hostAlias)}（${escapeHtml(
              platformLabel(account.platform),
            )} / ${escapeHtml(account.hostName)}）</option>`,
        )
        .join("")
    : '<option value="">-- 暂无已管理账号，请先到「账号与密钥」页创建 --</option>';
  if (!hasAccounts) {
    importAccountSelect.value = "";
  }
  updateImportPreview();
}

function updateImportPreview() {
  const alias = importAccountSelect.value;
  const parsed = parseGitUrl(importGitUrlInput.value);

  if (!alias) {
    importRemotePreview.textContent = "请先选择账号。";
    return;
  }
  if (!parsed) {
    importRemotePreview.textContent = "请输入可识别的 Git 地址。";
    return;
  }
  importRemotePreview.textContent = `git@${alias}:${parsed.fullPath}`;
}

async function importRepository() {
  const gitUrl = importGitUrlInput.value.trim();
  const hostAlias = importAccountSelect.value;
  const parentDirectory = importParentDirInput.value.trim();
  const directoryName = importDirNameInput.value.trim();
  const branch = importBranchInput.value.trim();

  if (!gitUrl) {
    setImportStatus("请输入 Git 地址。", "error");
    return;
  }
  if (!hostAlias) {
    setImportStatus("请选择账号。", "error");
    return;
  }
  if (!parentDirectory) {
    setImportStatus("请选择父目录。", "error");
    return;
  }

  const account = dashboardData.managedAccounts.find((item) => item.hostAlias === hostAlias);
  if (!account) {
    setImportStatus("所选账号不存在，请刷新数据后重试。", "error");
    return;
  }

  if (branch) {
    setImportStatus("正在验证分支...", "info");
    try {
      await invoke("verify_remote_branch", { gitUrl, branch });
    } catch (error) {
      setImportStatus(`分支验证失败：${String(error)}`, "error");
      return;
    }
  }

  setImportStatus("正在克隆仓库...", "info");
  try {
    const result = await invoke<string>("clone_repository", {
      request: {
        hostAlias,
        parentDirectory,
        gitUrl,
        gitUserName: account.workspaces[0]?.gitUserName || "Git SSH Manager",
        gitEmail: account.email,
        directoryName: directoryName || null,
        branch: branch || null,
      },
    });
    await loadDashboard();
    setImportStatus(result, "success");
  } catch (error) {
    setImportStatus(`克隆失败：${String(error)}`, "error");
  }
}

function resetImportForm() {
  importGitUrlInput.value = "";
  importParentDirInput.value = "";
  importDirNameInput.value = "";
  importBranchInput.value = "";
  if (importAccountSelect.options.length > 1) {
    importAccountSelect.value = "";
  }
  updateImportPreview();
  setImportStatus("准备就绪", "info");
}

function setKeysStatus(message: string, type: StatusType = "info") {
  keysStatusBox.textContent = message;
  keysStatusBox.dataset.type = type;
}

async function copyTextToClipboard(text: string): Promise<boolean> {
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

async function copyKeyPublic(keyName: string) {
  setKeysStatus("正在读取公钥...", "info");
  try {
    const content = await invoke<string>("read_public_key", { keyName });
    const copied = await copyTextToClipboard(content);
    setKeysStatus(
      copied ? `已复制公钥（${keyName}.pub）到剪贴板。` : "公钥已读取，但写入剪贴板失败，请手动复制。",
      copied ? "success" : "error",
    );
  } catch (error) {
    setKeysStatus(`复制失败：${String(error)}`, "error");
  }
}

function openCreateKeyModal() {
  createKeyNameInput.value = "";
  createKeyEmailInput.value = "";
  createKeyModal.classList.remove("hidden-section");
  createKeyNameInput.focus();
}

function closeCreateKeyModal() {
  createKeyModal.classList.add("hidden-section");
}

async function createNewKey() {
  const keyName = createKeyNameInput.value.trim();
  const email = createKeyEmailInput.value.trim() || null;

  if (!keyName) {
    setKeysStatus("请输入密钥文件名。", "error");
    return;
  }

  createKeyBtn.disabled = true;
  try {
    const result = await invoke<string>("create_key", { keyName, email });
    createKeyNameInput.value = "";
    createKeyEmailInput.value = "";
    await loadDashboard();
    renderKeySelect(keyName);
    closeCreateKeyModal();
    setKeysStatus(result, "success");
  } catch (error) {
    setKeysStatus(`创建失败：${String(error)}`, "error");
  } finally {
    createKeyBtn.disabled = false;
  }
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

    const result = await invoke<string>("add_account", { config });

    await loadDashboard();
    closeAccountForm();
    setAccountsStatus(result, "success");
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

function setAccountsStatus(message: string, type: StatusType = "info") {
  accountsStatusMessage.textContent = message;
  accountsStatusBox.dataset.type = type;
  accountsStatusBox.classList.remove("hidden-section");
}

function openDeleteAccountModal(hostAlias: string) {
  const account = dashboardData.managedAccounts.find((item) => item.hostAlias === hostAlias);
  if (!account) {
    return;
  }
  pendingDeleteAlias = hostAlias;
  deleteAccountModalText.textContent = `确认删除账号 ${hostAlias} 吗？关联的 ${account.workspaces.length} 个工作区绑定将一并移除。`;
  deleteAccountDeleteKeysLabel.textContent = `同时删除密钥文件（${account.keyName}）`;
  deleteAccountDeleteKeys.checked = false;
  deleteAccountModal.classList.remove("hidden-section");
  deleteAccountModalConfirm.focus();
}

function closeDeleteAccountModal() {
  deleteAccountModal.classList.add("hidden-section");
  pendingDeleteAlias = "";
}

async function refreshAccountWorkspaces(hostAlias: string) {
  setAccountsStatus(`正在刷新账号 ${hostAlias} 的工作区...`, "info");
  try {
    const result = await invoke<string>("refresh_account_workspaces", { hostAlias });
    await loadDashboard();
    setAccountsStatus(result, "success");
  } catch (error) {
    setAccountsStatus(`刷新失败：${String(error)}`, "error");
  }
}

async function removeAccount(hostAlias: string, deleteKeys: boolean) {
  setAccountsStatus("正在删除账号...", "info");
  try {
    const result = await invoke<string>("delete_account", {
      hostAlias,
      deleteKeyFiles: deleteKeys,
    });
    setAccountsStatus(result, "success");
    await loadDashboard();
  } catch (error) {
    setAccountsStatus(`删除失败：${String(error)}`, "error");
  }
}

interface EnvModalOptions {
  title: string;
  text: string;
  primaryText: string;
  secondaryText?: string;
  onPrimary?: () => void;
  onSecondary?: () => void;
}

let envModalOptions: EnvModalOptions | null = null;

function openEnvModal(options: EnvModalOptions) {
  envModalOptions = options;
  envModalTitle.textContent = options.title;
  envModalText.textContent = options.text;
  envModalPrimary.textContent = options.primaryText;
  if (options.secondaryText) {
    envModalSecondary.textContent = options.secondaryText;
    envModalSecondary.classList.remove("hidden-section");
  } else {
    envModalSecondary.classList.add("hidden-section");
  }
  envModal.classList.remove("hidden-section");
  envModalPrimary.focus();
}

function closeEnvModal() {
  envModal.classList.add("hidden-section");
  envModalOptions = null;
}

async function runEnvironmentCheck() {
  try {
    const status = await invoke<EnvironmentStatus>("check_environment");
    if (!status.gitAvailable) {
      openEnvModal({
        title: "未检测到 Git",
        text: "未在系统 PATH 中找到 git 命令。本软件的所有功能（扫描仓库、克隆、写入配置）都依赖 Git，无法继续使用。\n\n请安装 Git for Windows 后重新打开软件。",
        primaryText: "知道了",
      });
      return;
    }
    if (!status.hasSshKeys) {
      openEnvModal({
        title: "未检测到 SSH 密钥",
        text: `未在 ${status.sshDir} 目录下找到任何 SSH 密钥。\n没有密钥将无法通过 SSH 认证访问远程仓库，建议先创建一对密钥。`,
        primaryText: "前往创建密钥",
        secondaryText: "稍后再说",
        onPrimary: () => {
          setTab("accounts");
          openCreateKeyModal();
        },
      });
    }
  } catch {
    // 环境检查失败不阻塞启动
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

async function updateWindowMaximizeState() {
  const maximized = await appWindow.isMaximized();
  windowMaxBtn.classList.toggle("is-maximized", maximized);
  windowMaxBtn.setAttribute("aria-label", maximized ? "还原" : "最大化");
}

windowMinBtn.addEventListener("click", () => {
  appWindow.minimize();
});

windowMaxBtn.addEventListener("click", () => {
  appWindow.toggleMaximize();
});

windowCloseBtn.addEventListener("click", () => {
  appWindow.close();
});

titlebar.addEventListener("dblclick", (event) => {
  const target = event.target as HTMLElement;
  if (target.closest(".titlebar-controls")) {
    return;
  }
  appWindow.toggleMaximize();
});

// 兜底拖拽：内置 data-tauri-drag-region 只认按下时元素自身带属性，
// 这里统一处理标题栏内其余区域（含子元素）的手动拖动。
titlebar.addEventListener("mousedown", (event) => {
  if (event.button !== 0) {
    return;
  }
  const target = event.target as HTMLElement;
  if (target.hasAttribute("data-tauri-drag-region")) {
    return;
  }
  if (target.closest(".titlebar-controls")) {
    return;
  }
  event.preventDefault();
  appWindow.startDragging();
});

appWindow.onResized(() => {
  updateWindowMaximizeState();
});

updateWindowMaximizeState();

importGitUrlInput.addEventListener("input", () => {
  const parsed = parseGitUrl(importGitUrlInput.value);
  if (parsed && !importDirNameInput.value.trim()) {
    importDirNameInput.value = parsed.repoName.replace(/\.git$/i, "");
  }
  updateImportPreview();
});

importAccountSelect.addEventListener("change", updateImportPreview);

importPickDirBtn.addEventListener("click", async () => {
  try {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string") {
      importParentDirInput.value = selected;
    }
  } catch (error) {
    setImportStatus(`选择文件夹失败：${String(error)}`, "error");
  }
});

importCloneBtn.addEventListener("click", async () => {
  await importRepository();
});

importResetBtn.addEventListener("click", resetImportForm);

createKeyOpenBtn.addEventListener("click", openCreateKeyModal);

formCreateKeyBtn.addEventListener("click", openCreateKeyModal);

createKeyModalClose.addEventListener("click", closeCreateKeyModal);

createKeyModalCancel.addEventListener("click", closeCreateKeyModal);

createKeyModal.addEventListener("mousedown", (event) => {
  if (event.target === createKeyModal) {
    closeCreateKeyModal();
  }
});

createKeyNameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    createNewKey();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") {
    return;
  }
  if (!accountDrawer.classList.contains("hidden-section")) {
    closeAccountForm();
  } else if (!createKeyModal.classList.contains("hidden-section")) {
    closeCreateKeyModal();
  } else if (!deleteAccountModal.classList.contains("hidden-section")) {
    closeDeleteAccountModal();
  } else if (!envModal.classList.contains("hidden-section")) {
    closeEnvModal();
  }
});

createKeyBtn.addEventListener("click", async () => {
  await createNewKey();
});

platformSelect.addEventListener("change", () => {
  updatePlatformPreset();
});

hostAliasInput.addEventListener("input", updateRemotePreview);

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

newAccountBtn.addEventListener("click", () => {
  openAccountForm();
});

cancelAccountFormBtn.addEventListener("click", closeAccountForm);

drawerCloseBtn.addEventListener("click", closeAccountForm);

accountDrawer.addEventListener("mousedown", (event) => {
  if (event.target === accountDrawer) {
    closeAccountForm();
  }
});

saveBtn.addEventListener("click", async () => {
  await saveAccount();
});

testBtn.addEventListener("click", async () => {
  await testConnection();
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

  if (action === "toggle-detail" && hostAlias) {
    if (expandedAccountAliases.has(hostAlias)) {
      expandedAccountAliases.delete(hostAlias);
    } else {
      expandedAccountAliases.add(hostAlias);
    }
    renderManagedAccounts();
  }

  if (action === "load-account" && hostAlias) {
    const account = dashboardData.managedAccounts.find((item) => item.hostAlias === hostAlias);
    if (account) {
      openAccountForm(account);
    }
  }

  if (action === "refresh-workspaces" && hostAlias) {
    await refreshAccountWorkspaces(hostAlias);
  }

  if (action === "delete-account" && hostAlias) {
    openDeleteAccountModal(hostAlias);
  }
});

deleteAccountModalClose.addEventListener("click", closeDeleteAccountModal);

accountsStatusClose.addEventListener("click", () => {
  accountsStatusBox.classList.add("hidden-section");
});

deleteAccountModalCancel.addEventListener("click", closeDeleteAccountModal);

deleteAccountModal.addEventListener("mousedown", (event) => {
  if (event.target === deleteAccountModal) {
    closeDeleteAccountModal();
  }
});

deleteAccountModalConfirm.addEventListener("click", async () => {
  if (!pendingDeleteAlias) {
    return;
  }
  const alias = pendingDeleteAlias;
  closeDeleteAccountModal();
  await removeAccount(alias, deleteAccountDeleteKeys.checked);
});

envModalClose.addEventListener("click", closeEnvModal);

envModal.addEventListener("mousedown", (event) => {
  if (event.target === envModal) {
    closeEnvModal();
  }
});

envModalPrimary.addEventListener("click", () => {
  const options = envModalOptions;
  closeEnvModal();
  options?.onPrimary?.();
});

envModalSecondary.addEventListener("click", () => {
  const options = envModalOptions;
  closeEnvModal();
  options?.onSecondary?.();
});

existingKeysContainer.addEventListener("click", async (event) => {
  const target = event.target as HTMLElement;
  const button = target.closest("button");
  if (!button) {
    return;
  }

  const action = button.dataset.action;
  const keyName = button.dataset.keyName;

  if (action === "copy-key" && keyName) {
    await copyKeyPublic(keyName);
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
runEnvironmentCheck();
