<script setup lang="ts">
import { computed, ref } from "vue";
import {
  NButton,
  NForm,
  NFormItem,
  NFormItemGi,
  NGrid,
  NIcon,
  NInput,
  NSelect,
  NSpace,
  useMessage,
} from "naive-ui";
import { ArrowDownload24Regular, ArrowReset24Regular, FolderOpen24Regular } from "@vicons/fluent";
import {
  cloneRepository,
  dashboard,
  loadDashboard,
  pickDirectory,
  verifyRemoteBranch,
} from "../store";
import { parseGitUrl, platformLabel, type StatusType } from "../types";

const message = useMessage();

const gitUrl = ref("");
const hostAlias = ref("");
const parentDirectory = ref("");
const directoryName = ref("");
const branch = ref("");

const cloning = ref(false);
const statusText = ref("准备就绪");
const statusType = ref<StatusType>("info");

const accountOptions = computed(() =>
  dashboard.managedAccounts.map((account) => ({
    label: `${account.hostAlias}（${platformLabel(account.platform)} / ${account.hostName}）`,
    value: account.hostAlias,
  })),
);

const remotePreview = computed(() => {
  if (!hostAlias.value) return "请先选择账号。";
  const parsed = parseGitUrl(gitUrl.value);
  if (!parsed) return "请输入可识别的 Git 地址。";
  return `git@${hostAlias.value}:${parsed.fullPath}`;
});

function setStatus(text: string, type: StatusType = "info") {
  statusText.value = text;
  statusType.value = type;
}

function onGitUrlInput(value: string) {
  const parsed = parseGitUrl(value);
  if (parsed && !directoryName.value.trim()) {
    directoryName.value = parsed.repoName.replace(/\.git$/i, "");
  }
}

async function chooseParentDirectory() {
  try {
    const selected = await pickDirectory();
    if (selected) parentDirectory.value = selected;
  } catch (error) {
    setStatus(`选择文件夹失败：${String(error)}`, "error");
  }
}

async function startClone() {
  if (!gitUrl.value.trim()) return setStatus("请输入 Git 地址。", "error");
  if (!hostAlias.value) return setStatus("请选择账号。", "error");
  if (!parentDirectory.value.trim()) return setStatus("请选择父目录。", "error");

  const account = dashboard.managedAccounts.find((item) => item.hostAlias === hostAlias.value);
  if (!account) return setStatus("所选账号不存在，请刷新数据后重试。", "error");

  cloning.value = true;
  try {
    const trimmedBranch = branch.value.trim();
    if (trimmedBranch) {
      setStatus("正在验证分支...", "info");
      try {
        await verifyRemoteBranch(gitUrl.value, trimmedBranch);
      } catch (error) {
        setStatus(`分支验证失败：${String(error)}`, "error");
        return;
      }
    }

    setStatus("正在克隆仓库...", "info");
    const result = await cloneRepository({
      hostAlias: hostAlias.value,
      parentDirectory: parentDirectory.value,
      gitUrl: gitUrl.value,
      gitUserName: account.workspaces[0]?.gitUserName || "Git SSH Manager",
      gitEmail: account.email,
      directoryName: directoryName.value.trim() || null,
      branch: trimmedBranch || null,
    });
    await loadDashboard();
    setStatus(result, "success");
    message.success(result);
  } catch (error) {
    setStatus(`克隆失败：${String(error)}`, "error");
  } finally {
    cloning.value = false;
  }
}

function resetForm() {
  gitUrl.value = "";
  hostAlias.value = "";
  parentDirectory.value = "";
  directoryName.value = "";
  branch.value = "";
  setStatus("准备就绪", "info");
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2 class="page-head__title">快速导入仓库</h2>
        <p class="page-head__desc">
          粘贴仓库地址，选择已管理的账号，即可用该账号的 Host 别名克隆到本地。
        </p>
      </div>
    </div>

    <n-form label-placement="top" size="small" :show-feedback="false">
      <n-grid :cols="2" :x-gap="12" :y-gap="12" responsive="screen" cols="1 s:1 m:2">
        <n-form-item-gi label="Git 地址">
          <n-input
            v-model:value="gitUrl"
            placeholder="例如：git@your-host:group/project.git"
            @update:value="onGitUrlInput"
          />
        </n-form-item-gi>

        <n-form-item-gi label="使用账号">
          <n-select
            v-model:value="hostAlias"
            :options="accountOptions"
            placeholder="-- 请选择账号 --"
            :disabled="!accountOptions.length"
          />
        </n-form-item-gi>

        <n-form-item-gi label="父目录" span="2">
          <div class="form-row" style="width: 100%">
            <n-input
              v-model:value="parentDirectory"
              readonly
              placeholder="选择存放新仓库的父目录"
              class="form-row__grow"
            />
            <n-button secondary @click="chooseParentDirectory">
              <template #icon><n-icon :component="FolderOpen24Regular" /></template>
              选择文件夹
            </n-button>
          </div>
        </n-form-item-gi>

        <n-form-item-gi label="文件夹名称">
          <n-input v-model:value="directoryName" placeholder="留空则使用仓库名" />
        </n-form-item-gi>

        <n-form-item-gi label="分支（可选）">
          <n-input v-model:value="branch" placeholder="留空则克隆仓库默认分支" />
        </n-form-item-gi>
      </n-grid>
    </n-form>

    <div class="card preview-card">
      <div class="preview-label">克隆地址预览</div>
      <code class="preview-value">{{ remotePreview }}</code>
    </div>

    <n-space :size="8">
      <n-button type="primary" :loading="cloning" @click="startClone">
        <template #icon><n-icon :component="ArrowDownload24Regular" /></template>
        开始克隆
      </n-button>
      <n-button secondary :disabled="cloning" @click="resetForm">
        <template #icon><n-icon :component="ArrowReset24Regular" /></template>
        重置
      </n-button>
    </n-space>

    <div class="status-bar" :class="{ 'is-success': statusType === 'success', 'is-error': statusType === 'error' }">
      <span class="status-bar__text">{{ statusText }}</span>
    </div>
  </div>
</template>
