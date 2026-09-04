<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  NButton,
  NCheckbox,
  NDrawer,
  NDrawerContent,
  NForm,
  NFormItem,
  NFormItemGi,
  NGrid,
  NIcon,
  NInput,
  NSelect,
  NSpace,
  NText,
  useMessage,
} from "naive-ui";
import {
  Add24Regular,
  FolderOpen24Regular,
  PlugDisconnected24Regular,
  Save24Regular,
  Search24Regular,
} from "@vicons/fluent";
import {
  addAccount,
  dashboard,
  loadDashboard,
  pickDirectory,
  scanWorkspaceRepositories,
  testSshConnection,
} from "../store";
import {
  openCreateKeyModal,
  closeAccountForm,
  accountDrawerOpen,
  editingAccount,
  setTab,
} from "../ui";
import {
  PLATFORM_HOST_MAP,
  PLATFORM_LABEL_MAP,
  type AccountConfig,
  type Platform,
  type ScannedRepository,
  type StatusType,
} from "../types";

const message = useMessage();

const platform = ref<Platform>("codeup");
const hostAlias = ref("");
const hostName = ref("");
const sshUser = ref("git");
const keyName = ref("");
const email = ref("");
const gitUserName = ref("");
const workspacePath = ref("");

const repositories = ref<ScannedRepository[]>([]);
const selectedPaths = ref<string[]>([]);

const scanning = ref(false);
const saving = ref(false);
const testing = ref(false);
const statusText = ref("准备就绪");
const statusType = ref<StatusType>("info");

const platformOptions = (Object.keys(PLATFORM_LABEL_MAP) as Platform[]).map((value) => ({
  label: PLATFORM_LABEL_MAP[value],
  value,
}));

const keyOptions = computed(() =>
  dashboard.existingKeys.map((key) => ({ label: key.keyName, value: key.keyName })),
);

const hostNameReadonly = computed(() => platform.value !== "custom");

const platformHint = computed(() => {
  switch (platform.value) {
    case "codeup":
      return "云效多账号建议使用不同 Host 别名，真实域名固定为 codeup.aliyun.com。";
    case "github":
      return "GitHub 默认真实域名为 github.com，可使用多个别名绑定不同密钥。";
    case "gitlab":
      return "GitLab 默认真实域名为 gitlab.com，可使用多个别名绑定不同密钥。";
    default:
      return "自定义平台可自行填写真实域名，建议仍然使用唯一 Host 别名。";
  }
});

const remotePreview = computed(() => `git@${hostAlias.value.trim() || "your-alias"}:命名空间/仓库.git`);

const scanSummary = computed(() => {
  if (!workspacePath.value.trim()) return "请先选择一个工作区文件夹。";
  if (!repositories.value.length) return "尚未扫描工作区。";
  return `已扫描到 ${repositories.value.length} 个子 Git 仓库，当前勾选 ${selectedPaths.value.length} 个。`;
});

function setStatus(text: string, type: StatusType = "info") {
  statusText.value = text;
  statusType.value = type;
}

function buildConfig() {
  return {
    platform: platform.value,
    hostAlias: hostAlias.value.trim(),
    hostName: hostName.value.trim(),
    user: sshUser.value.trim(),
    email: email.value.trim(),
    keyName: keyName.value.trim(),
    gitUserName: gitUserName.value.trim() || undefined,
    workspacePath: workspacePath.value.trim() || undefined,
    reuseExistingKey: true,
    selectedRepoPaths: [...selectedPaths.value],
  };
}

/* ---------------- 打开 / 关闭时初始化 ---------------- */

function applyPlatformPreset() {
  if (hostNameReadonly.value) {
    hostName.value = PLATFORM_HOST_MAP[platform.value];
  } else if (!hostName.value.trim()) {
    hostName.value = "";
  }
}

function resetForm() {
  platform.value = "codeup";
  hostAlias.value = "";
  hostName.value = "";
  sshUser.value = "git";
  email.value = "";
  gitUserName.value = "";
  workspacePath.value = "";
  repositories.value = [];
  selectedPaths.value = [];
  applyPlatformPreset();
  keyName.value = dashboard.existingKeys[0]?.keyName ?? "";
  setStatus("准备就绪", "info");
}

watch(accountDrawerOpen, (open) => {
  if (!open) return;
  const account = editingAccount.value;
  if (account) {
    platform.value = account.platform;
    applyPlatformPreset();
    hostAlias.value = account.hostAlias;
    hostName.value = account.hostName;
    sshUser.value = account.user;
    keyName.value = account.keyName;
    email.value = account.email;
    gitUserName.value = "";
    workspacePath.value = "";
    repositories.value = [];
    selectedPaths.value = [];
    setStatus(`已载入账号 ${account.hostAlias}，可重新绑定工作区或测试 SSH。`, "info");
  } else {
    resetForm();
  }
});

/* ---------------- 行为 ---------------- */

function onPlatformChange() {
  applyPlatformPreset();
}

async function chooseWorkspace() {
  try {
    const selected = await pickDirectory();
    if (selected) {
      workspacePath.value = selected;
      repositories.value = [];
      selectedPaths.value = [];
    }
  } catch (error) {
    setStatus(`选择文件夹失败：${String(error)}`, "error");
  }
}

function clearWorkspace() {
  workspacePath.value = "";
  repositories.value = [];
  selectedPaths.value = [];
}

async function scanRepositories() {
  if (!workspacePath.value.trim()) {
    setStatus("请先选择工作区文件夹。", "error");
    return;
  }

  scanning.value = true;
  setStatus("正在扫描子 Git 仓库...", "info");
  try {
    const result = await scanWorkspaceRepositories(workspacePath.value);
    repositories.value = result;
    selectedPaths.value = result.map((item) => item.path);
    setStatus(
      result.length ? `已扫描到 ${result.length} 个子 Git 仓库，并默认全部勾选。` : "当前工作区下未发现子 Git 仓库。",
      result.length ? "success" : "info",
    );
  } catch (error) {
    repositories.value = [];
    selectedPaths.value = [];
    setStatus(`扫描失败：${String(error)}`, "error");
  } finally {
    scanning.value = false;
  }
}

function toggleRepo(path: string, checked: boolean) {
  selectedPaths.value = checked
    ? [...new Set([...selectedPaths.value, path])]
    : selectedPaths.value.filter((item) => item !== path);
}

async function saveAccount() {
  setStatus("正在保存账号配置...", "info");

  const config = buildConfig();
  if (config.workspacePath && !config.selectedRepoPaths?.length) {
    setStatus("请先扫描工作区，并勾选至少一个子 Git 仓库。", "error");
    return;
  }

  // 未选工作区时不下发这两个字段（而不是事后 delete，类型上更干净）
  const payload: AccountConfig = config.workspacePath
    ? config
    : { ...config, workspacePath: undefined, selectedRepoPaths: undefined };

  saving.value = true;
  try {
    const result = await addAccount(payload);
    await loadDashboard();
    closeAccountForm();
    setTab("accounts");
    message.success(result);
  } catch (error) {
    setStatus(`保存失败：${String(error)}`, "error");
  } finally {
    saving.value = false;
  }
}

async function testConnection() {
  testing.value = true;
  setStatus("正在测试 SSH 连接...", "info");
  try {
    const result = await testSshConnection(buildConfig());
    setStatus(result.message, result.success ? "success" : "error");
  } catch (error) {
    setStatus(`测试失败：${String(error)}`, "error");
  } finally {
    testing.value = false;
  }
}
</script>

<template>
  <n-drawer
    :show="accountDrawerOpen"
    :width="560"
    placement="right"
    :trap-focus="false"
    @update:show="(value: boolean) => !value && closeAccountForm()"
  >
    <n-drawer-content closable @close="closeAccountForm">
      <template #header>{{ editingAccount ? `编辑账号 ${editingAccount.hostAlias}` : "新建账号" }}</template>

      <template #default>
        <n-text depth="3" style="font-size: 12.5px; display: block; margin-bottom: 12px">
          先选平台，再填写 Host 别名。对于云效多账号，真实域名相同，但 Host 别名必须不同。
        </n-text>

        <n-form label-placement="top" size="small" :show-feedback="false">
          <n-grid :x-gap="12" :y-gap="12" responsive="screen" cols="1 s:1 m:2">
            <n-form-item-gi label="平台类型">
              <n-select v-model:value="platform" :options="platformOptions" @update:value="onPlatformChange" />
            </n-form-item-gi>

            <n-form-item-gi label="Host 别名">
              <n-input v-model:value="hostAlias" placeholder="例如：work-account" />
            </n-form-item-gi>

            <n-form-item-gi label="真实域名">
              <n-input
                v-model:value="hostName"
                :readonly="hostNameReadonly"
                placeholder="例如：codeup.aliyun.com"
              />
            </n-form-item-gi>

            <n-form-item-gi label="SSH 用户">
              <n-input v-model:value="sshUser" placeholder="例如：git" />
            </n-form-item-gi>

            <n-form-item-gi label="使用密钥">
              <div class="form-row" style="width: 100%">
                <n-select
                  v-model:value="keyName"
                  :options="keyOptions"
                  placeholder="-- 请选择密钥 --"
                  class="form-row__grow"
                />
                <n-button secondary @click="openCreateKeyModal">
                  <template #icon><n-icon :component="Add24Regular" /></template>
                  新建密钥
                </n-button>
              </div>
            </n-form-item-gi>

            <n-form-item-gi label="Git 用户名">
              <n-input v-model:value="gitUserName" placeholder="例如：张三 / your-name" />
            </n-form-item-gi>

            <n-form-item-gi label="邮箱" span="2">
              <n-input v-model:value="email" placeholder="例如：work@example.com" />
            </n-form-item-gi>
          </n-grid>
        </n-form>

        <p style="margin: -4px 0 12px; color: var(--text-3); font-size: 12.5px; line-height: 1.6">
          {{ platformHint }}
        </p>

        <n-form label-placement="top" size="small" :show-feedback="false">
          <n-form-item label="工作区文件夹">
            <div class="form-row" style="width: 100%">
              <n-input
                v-model:value="workspacePath"
                readonly
                placeholder="选择父目录也可以，工具会自动扫描其中带 .git 的子项目"
                class="form-row__grow"
              />
              <n-button secondary @click="chooseWorkspace">
                <template #icon><n-icon :component="FolderOpen24Regular" /></template>
                选择文件夹
              </n-button>
              <n-button quaternary @click="clearWorkspace">清空</n-button>
            </div>
          </n-form-item>
        </n-form>

        <div class="card card--pad" style="margin-bottom: 12px">
          <div class="section-head" style="margin: 0 0 10px">
            <div>
              <h3 class="section-head__title" style="font-size: 14px">子仓库扫描</h3>
              <p class="section-head__desc" style="font-size: 12px">
                先扫描当前工作区下所有带 .git 的子目录，再勾选需要绑定的仓库。
              </p>
            </div>
          </div>

          <n-space :size="8" style="margin-bottom: 10px">
            <n-button size="small" secondary :loading="scanning" @click="scanRepositories">
              <template #icon><n-icon :component="Search24Regular" /></template>
              扫描子仓库
            </n-button>
            <n-button size="small" quaternary @click="selectedPaths = repositories.map((item) => item.path)">
              全选
            </n-button>
            <n-button size="small" quaternary @click="selectedPaths = []">清空勾选</n-button>
          </n-space>

          <div class="status-bar" style="margin: 0 0 10px">{{ scanSummary }}</div>

          <div v-if="repositories.length" class="repo-list">
            <label
              v-for="repo in repositories"
              :key="repo.path"
              class="repo-item"
              :class="{ 'is-checked': selectedPaths.includes(repo.path) }"
            >
              <n-checkbox
                :checked="selectedPaths.includes(repo.path)"
                @update:checked="(checked: boolean) => toggleRepo(repo.path, checked)"
              />
              <div class="repo-item__body">
                <span class="repo-item__name">{{ repo.name }}</span>
                <span class="repo-item__meta">{{ repo.relativePath }}</span>
                <span class="repo-item__origin">origin: {{ repo.originUrl || "未设置" }}</span>
              </div>
            </label>
          </div>
          <div v-else class="empty-hint">扫描后会在这里列出所有子 Git 仓库。</div>
        </div>

        <div class="card preview-card">
          <div class="preview-label">Remote 预览</div>
          <code class="preview-value">{{ remotePreview }}</code>
        </div>

        <div
          class="status-bar"
          :class="{ 'is-success': statusType === 'success', 'is-error': statusType === 'error' }"
        >
          <span class="status-bar__text">{{ statusText }}</span>
        </div>
      </template>

      <template #footer>
        <div class="drawer-footer">
          <n-button quaternary @click="closeAccountForm">取消</n-button>
          <n-button secondary :loading="testing" @click="testConnection">
            <template #icon><n-icon :component="PlugDisconnected24Regular" /></template>
            测试 SSH
          </n-button>
          <n-button type="primary" :loading="saving" @click="saveAccount">
            <template #icon><n-icon :component="Save24Regular" /></template>
            保存账号并绑定工作区
          </n-button>
        </div>
      </template>
    </n-drawer-content>
  </n-drawer>
</template>
