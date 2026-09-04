<script setup lang="ts">
import { NConfigProvider, NDialogProvider, NGlobalStyle, NMessageProvider } from "naive-ui";
import AppShell from "./components/AppShell.vue";
import { naiveTheme, themeOverrides } from "./theme";
</script>

<template>
  <n-config-provider class="app-provider" :theme="naiveTheme" :theme-overrides="themeOverrides">
    <n-global-style />
    <n-message-provider :max="3" placement="bottom-right">
      <n-dialog-provider>
        <app-shell />
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<style>
.app-provider {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
</style>
