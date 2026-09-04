<script setup lang="ts">
import { ref, watch } from "vue";
import { NButton, NForm, NFormItem, NInput, NModal, NText, useMessage } from "naive-ui";
import { createKey, loadDashboard } from "../store";
import { closeCreateKeyModal, createKeyModalOpen } from "../ui";

const message = useMessage();

const keyName = ref("");
const email = ref("");
const creating = ref(false);

watch(createKeyModalOpen, (open) => {
  if (open) {
    keyName.value = "";
    email.value = "";
  }
});

async function submit() {
  if (!keyName.value.trim()) {
    message.error("请输入密钥文件名。");
    return;
  }

  creating.value = true;
  try {
    const result = await createKey(keyName.value.trim(), email.value.trim() || null);
    await loadDashboard();
    closeCreateKeyModal();
    message.success(result);
  } catch (error) {
    message.error(`创建失败：${String(error)}`);
  } finally {
    creating.value = false;
  }
}
</script>

<template>
  <n-modal
    :show="createKeyModalOpen"
    preset="card"
    style="width: 440px"
    title="创建新密钥"
    :bordered="false"
    size="small"
    @update:show="(value: boolean) => !value && closeCreateKeyModal()"
    @after-leave="keyName = ''"
  >
    <n-form label-placement="top" size="small" :show-feedback="false" @submit.prevent="submit">
      <n-form-item label="密钥文件名">
        <n-input
          v-model:value="keyName"
          placeholder="例如：id_work_account"
          @keydown.enter.prevent="submit"
        />
      </n-form-item>
      <n-form-item label="注释邮箱（可选）">
        <n-input
          v-model:value="email"
          type="email"
          placeholder="例如：work@example.com"
          @keydown.enter.prevent="submit"
        />
      </n-form-item>
    </n-form>

    <n-text depth="3" style="font-size: 12px">
      密钥会生成在 ~/.ssh 目录下，创建后可在「账号与密钥」页复制公钥。
    </n-text>

    <template #footer>
      <div style="display: flex; justify-content: flex-end; gap: 8px">
        <n-button quaternary @click="closeCreateKeyModal">取消</n-button>
        <n-button type="primary" :loading="creating" @click="submit">创建密钥</n-button>
      </div>
    </template>
  </n-modal>
</template>
