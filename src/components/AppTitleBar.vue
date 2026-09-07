<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  ArrowSync24Regular,
  ArrowDownload24Regular,
  Home24Regular,
  Key24Regular,
} from "@vicons/fluent";
import { NIcon, NTooltip, useMessage } from "naive-ui";
import { activeTab, setTab } from "../ui";
import { loadDashboard } from "../store";
import type { TabKey } from "../types";

const appWindow = getCurrentWindow();
const maximized = ref(false);
const refreshing = ref(false);
const message = useMessage();

interface NavItem {
  key: TabKey;
  label: string;
  icon: typeof Home24Regular;
}

const navItems: NavItem[] = [
  { key: "home", label: "使用说明", icon: Home24Regular },
  { key: "import", label: "快速导入", icon: ArrowDownload24Regular },
  { key: "accounts", label: "账号与密钥", icon: Key24Regular },
];

async function refresh() {
  if (refreshing.value) return;
  refreshing.value = true;
  try {
    await loadDashboard();
    message.success("列表已刷新");
  } catch (error) {
    message.error(`刷新失败：${String(error)}`);
  } finally {
    refreshing.value = false;
  }
}

async function syncMaximized() {
  maximized.value = await appWindow.isMaximized();
}

async function toggleMaximize() {
  await appWindow.toggleMaximize();
  await syncMaximized();
}

/**
 * 兜底拖拽：Tauri 内置的 data-tauri-drag-region 只识别按下瞬间命中的元素自身，
 * 这里统一接管标题栏其余区域（含子元素）的拖动。
 * 标题栏里的窗口控制按钮、顶部菜单项、刷新按钮都是交互元素，不能触发拖动。
 */
function onTitlebarMouseDown(event: MouseEvent) {
  if (event.button !== 0) return;
  const target = event.target as HTMLElement | null;
  if (!target) return;
  if (
    target.closest(".titlebar__controls") ||
    target.closest(".titlebar-tab") ||
    target.closest(".titlebar-refresh")
  ) {
    return;
  }
  event.preventDefault();
  void appWindow.startDragging();
}

function onTitlebarDoubleClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  if (!target) return;
  if (target.closest(".titlebar__controls")) return;
  if (target.closest(".titlebar-tab")) return;
  if (target.closest(".titlebar-refresh")) return;
  void toggleMaximize();
}

let unlisten: (() => void) | undefined;

onMounted(async () => {
  await syncMaximized();
  unlisten = await appWindow.onResized(() => void syncMaximized());
});

onBeforeUnmount(() => unlisten?.());
</script>

<template>
  <header
    class="titlebar"
    data-tauri-drag-region
    @mousedown="onTitlebarMouseDown"
    @dblclick="onTitlebarDoubleClick"
  >
    <div class="titlebar__brand" data-tauri-drag-region>
      <n-icon class="titlebar__icon" :component="Key24Regular" />
      <span class="titlebar__title" data-tauri-drag-region>Git 密钥管理器</span>
    </div>

    <nav class="titlebar__menu" role="tablist" aria-label="功能菜单">
      <button
        v-for="item in navItems"
        :key="item.key"
        class="titlebar-tab"
        type="button"
        role="tab"
        :class="{ 'is-active': activeTab === item.key }"
        :aria-selected="activeTab === item.key"
        @click="setTab(item.key)"
      >
        <n-icon class="titlebar-tab__icon" :component="item.icon" />
        <span class="titlebar-tab__label">{{ item.label }}</span>
      </button>
    </nav>

    <div class="titlebar__actions">
      <n-tooltip placement="bottom" :delay="400">
        <template #trigger>
          <button
            class="titlebar-refresh"
            type="button"
            :class="{ 'is-loading': refreshing }"
            :disabled="refreshing"
            aria-label="刷新数据"
            @click="refresh"
          >
            <!-- Fluent 图标墨迹只占 24 viewBox 的 ~73%（圆环 17.5/24），
                 10px 窗口控制图标光学对齐需补偿：10 / 0.73 ≈ 13；
                 实际取 15px（用户从预览 10~15 六档中选定） -->
            <n-icon class="titlebar-refresh__icon" :size="15" :component="ArrowSync24Regular" />
          </button>
        </template>
        刷新数据
      </n-tooltip>
    </div>

    <div class="titlebar__controls">
      <button class="win-btn" type="button" aria-label="最小化" @click="appWindow.minimize()">
        <svg viewBox="0 0 10 10" aria-hidden="true">
          <line x1="0" y1="5" x2="10" y2="5" stroke="currentColor" stroke-width="1" />
        </svg>
      </button>

      <button
        class="win-btn"
        type="button"
        :aria-label="maximized ? '向下还原' : '最大化'"
        @click="toggleMaximize"
      >
        <svg v-if="!maximized" viewBox="0 0 10 10" aria-hidden="true">
          <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1" />
        </svg>
        <svg v-else viewBox="0 0 10 10" aria-hidden="true">
          <path d="M2.5 0.5 H9.5 V7.5 M0.5 0.5 H7.5 V7.5 H0.5 Z" fill="none" stroke="currentColor" stroke-width="1" />
        </svg>
      </button>

      <button class="win-btn win-btn--close" type="button" aria-label="关闭" @click="appWindow.close()">
        <svg viewBox="0 0 10 10" aria-hidden="true">
          <path d="M0.5 0.5 L9.5 9.5 M9.5 0.5 L0.5 9.5" stroke="currentColor" stroke-width="1" />
        </svg>
      </button>
    </div>
  </header>
</template>

<style scoped>
.titlebar {
  -webkit-app-region: no-drag;
}
</style>
