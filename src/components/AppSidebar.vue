<script setup lang="ts">
import { ref } from "vue";
import { useMessage, NIcon, NButton } from "naive-ui";
import {
  ArrowClockwise20Regular,
  ArrowDownload24Regular,
  Home24Regular,
  Key24Regular,
} from "@vicons/fluent";
import { activeTab, setTab } from "../ui";
import { loadDashboard } from "../store";
import type { TabKey } from "../types";

const message = useMessage();
const refreshing = ref(false);

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
</script>

<template>
  <aside class="sidebar">
    <nav class="sidebar__menu" role="tablist" aria-label="功能菜单">
      <button
        v-for="item in navItems"
        :key="item.key"
        class="nav-item"
        type="button"
        role="tab"
        :class="{ 'is-active': activeTab === item.key }"
        :aria-selected="activeTab === item.key"
        @click="setTab(item.key)"
      >
        <n-icon class="nav-item__icon" :component="item.icon" />
        <span>{{ item.label }}</span>
      </button>
    </nav>

    <div class="sidebar__footer">
      <n-button quaternary block size="small" :loading="refreshing" @click="refresh">
        <template #icon>
          <n-icon :component="ArrowClockwise20Regular" />
        </template>
        刷新数据
      </n-button>
    </div>
  </aside>
</template>
