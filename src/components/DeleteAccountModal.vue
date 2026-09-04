<script setup lang="ts">
import { ref, watch } from "vue";
import { NButton, NCheckbox, NModal, NText, useMessage } from "naive-ui";
import { deleteAccount, loadDashboard } from "../store";
import { closeDeleteAccount, deleteTarget } from "../ui";

const message = useMessage();

const deleteKeyFiles = ref(false);
const removing = ref(false);

watch(deleteTarget, (target) => {
  if (target) deleteKeyFiles.value = false;
});

async function confirm() {
  const target = deleteTarget.value;
  if (!target) return;

  const alias = target.hostAlias;
  const withKeys = deleteKeyFiles.value;
  removing.value = true;
  try {
    const result = await deleteAccount(alias, withKeys);
    await loadDashboard();
    closeDeleteAccount();
    message.success(result);
  } catch (error) {
    message.error(`删除失败：${String(error)}`);
  } finally {
    removing.value = false;
  }
}
</script>

<template>
  <n-modal
    :show="!!deleteTarget"
    preset="card"
    style="width: 440px"
    title="删除账号"
    :bordered="false"
    size="small"
    @update:show="(value: boolean) => !value && closeDeleteAccount()"
  >
    <template v-if="deleteTarget">
      <n-text style="display: block; line-height: 1.7">
        确认删除账号 <strong>{{ deleteTarget.hostAlias }}</strong> 吗？关联的
        {{ deleteTarget.workspaces.length }} 个工作区绑定将一并移除。
      </n-text>

      <n-checkbox v-model:checked="deleteKeyFiles" style="margin-top: 14px">
        同时删除密钥文件（{{ deleteTarget.keyName }}）
      </n-checkbox>

      <n-text v-if="deleteKeyFiles" depth="3" style="display: block; margin-top: 8px; font-size: 12px">
        该操作会删除磁盘上的公私钥文件，且不可恢复。
      </n-text>
    </template>

    <template #footer>
      <div style="display: flex; justify-content: flex-end; gap: 8px">
        <n-button quaternary @click="closeDeleteAccount">取消</n-button>
        <n-button type="error" :loading="removing" @click="confirm">删除</n-button>
      </div>
    </template>
  </n-modal>
</template>
