<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from "vue";
import { useMessage } from "naive-ui";
import AppTitleBar from "./AppTitleBar.vue";
import AppSidebar from "./AppSidebar.vue";
import HomeView from "../views/HomeView.vue";
import ImportView from "../views/ImportView.vue";
import AccountsView from "../views/AccountsView.vue";
import AccountDrawer from "./AccountDrawer.vue";
import CreateKeyModal from "./CreateKeyModal.vue";
import DeleteAccountModal from "./DeleteAccountModal.vue";
import EnvNoticeModal from "./EnvNoticeModal.vue";
import { activeTab, closeTopOverlay, openCreateKeyModal, openEnvNotice, setTab } from "../ui";
import { checkEnvironment, loadDashboard } from "../store";
import { initThemeSync, initWindowEffect } from "../theme";

const message = useMessage();

const views = { home: HomeView, import: ImportView, accounts: AccountsView };
const currentView = computed(() => views[activeTab.value]);

async function runEnvironmentCheck() {
  try {
    const status = await checkEnvironment();

    if (!status.gitAvailable) {
      openEnvNotice({
        title: "未检测到 Git",
        text: "未在系统 PATH 中找到 git 命令。本软件的所有功能（扫描仓库、克隆、写入配置）都依赖 Git，无法继续使用。\n\n请安装 Git for Windows 后重新打开软件。",
        primaryText: "知道了",
      });
      return;
    }

    if (!status.hasSshKeys) {
      openEnvNotice({
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

function onKeydown(event: KeyboardEvent) {
  if (event.key !== "Escape") return;
  if (closeTopOverlay()) {
    event.preventDefault();
  }
}

onMounted(async () => {
  document.addEventListener("keydown", onKeydown);

  await initThemeSync();
  await initWindowEffect();

  try {
    await loadDashboard();
  } catch (error) {
    message.error(`初始化失败：${String(error)}`);
  }

  await runEnvironmentCheck();
});

onBeforeUnmount(() => {
  document.removeEventListener("keydown", onKeydown);
});
</script>

<template>
  <app-title-bar />

  <div class="app-shell">
    <app-sidebar />

    <main class="app-content">
      <transition name="fade" mode="out-in">
        <component :is="currentView" :key="activeTab" />
      </transition>
    </main>
  </div>

  <account-drawer />
  <create-key-modal />
  <delete-account-modal />
  <env-notice-modal />
</template>
