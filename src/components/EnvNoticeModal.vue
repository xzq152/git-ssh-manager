<script setup lang="ts">
import { NButton, NModal, NText } from "naive-ui";
import { closeEnvNotice, envNotice } from "../ui";

function onPrimary() {
  const notice = envNotice.value;
  closeEnvNotice();
  notice?.onPrimary?.();
}

function onSecondary() {
  const notice = envNotice.value;
  closeEnvNotice();
  notice?.onSecondary?.();
}
</script>

<template>
  <n-modal
    :show="!!envNotice"
    preset="card"
    style="width: 460px"
    :title="envNotice?.title ?? ''"
    :bordered="false"
    size="small"
    @update:show="(value: boolean) => !value && closeEnvNotice()"
  >
    <n-text style="display: block; white-space: pre-wrap; line-height: 1.7">
      {{ envNotice?.text }}
    </n-text>

    <template #footer>
      <div style="display: flex; justify-content: flex-end; gap: 8px">
        <n-button v-if="envNotice?.secondaryText" quaternary @click="onSecondary">
          {{ envNotice?.secondaryText }}
        </n-button>
        <n-button type="primary" @click="onPrimary">
          {{ envNotice?.primaryText }}
        </n-button>
      </div>
    </template>
  </n-modal>
</template>
