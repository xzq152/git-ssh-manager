<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Key24Regular } from "@vicons/fluent";
import { NIcon } from "naive-ui";

const appWindow = getCurrentWindow();
const maximized = ref(false);

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
 */
function onTitlebarMouseDown(event: MouseEvent) {
  if (event.button !== 0) return;
  const target = event.target as HTMLElement | null;
  if (!target) return;
  if (target.closest(".titlebar__controls")) return;
  event.preventDefault();
  void appWindow.startDragging();
}

function onTitlebarDoubleClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  if (target?.closest(".titlebar__controls")) return;
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
