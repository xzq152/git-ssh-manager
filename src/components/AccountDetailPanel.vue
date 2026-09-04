<script setup lang="ts">
import { NTag, NText } from "naive-ui";
import { platformLabel, type ManagedAccount } from "../types";

const props = defineProps<{ account: ManagedAccount }>();
</script>

<template>
  <div class="detail-panel">
    <div class="detail-grid">
      <div><strong>平台：</strong>{{ platformLabel(props.account.platform) }}</div>
      <div><strong>HostName：</strong>{{ props.account.hostName }}</div>
      <div><strong>SSH 用户：</strong>{{ props.account.user }}</div>
      <div>
        <strong>邮箱：</strong>
        <n-text v-if="props.account.email">{{ props.account.email }}</n-text>
        <n-text v-else depth="3">未填写</n-text>
      </div>
      <div><strong>密钥名：</strong>{{ props.account.keyName }}</div>
      <div><strong>私钥：</strong><span class="mono">{{ props.account.keyPath }}</span></div>
      <div style="grid-column: 1 / -1">
        <strong>公钥：</strong><span class="mono">{{ props.account.publicKeyPath }}</span>
      </div>
    </div>

    <div>
      <span class="detail-label">Remote 示例</span>
      <code class="preview-value">git@{{ props.account.hostAlias }}:命名空间/仓库.git</code>
    </div>

    <div>
      <span class="detail-label">工作区绑定</span>
      <ul v-if="props.account.workspaces.length" class="workspace-list">
        <li v-for="workspace in props.account.workspaces" :key="workspace.workspacePath" class="workspace-item">
          <span>{{ workspace.workspacePath }}</span>
          <n-tag size="small" :bordered="false">{{ workspace.gitEmail }}</n-tag>
        </li>
      </ul>
      <n-text v-else depth="3" style="font-size: 12px">还未绑定工作区</n-text>
    </div>
  </div>
</template>
