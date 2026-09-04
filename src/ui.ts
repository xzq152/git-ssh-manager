import { computed, ref } from "vue";
import type { ManagedAccount, TabKey } from "./types";

/* ---------------- 标签页 ---------------- */

export const activeTab = ref<TabKey>("home");

export function setTab(tab: TabKey) {
  activeTab.value = tab;
}

/* ---------------- 账号抽屉（新建 / 编辑） ---------------- */

export const accountDrawerOpen = ref(false);
export const editingAccount = ref<ManagedAccount | null>(null);

export function openAccountForm(account?: ManagedAccount) {
  editingAccount.value = account ?? null;
  accountDrawerOpen.value = true;
}

export function closeAccountForm() {
  accountDrawerOpen.value = false;
  editingAccount.value = null;
}

/* ---------------- 创建密钥弹窗 ---------------- */

export const createKeyModalOpen = ref(false);

export function openCreateKeyModal() {
  createKeyModalOpen.value = true;
}

export function closeCreateKeyModal() {
  createKeyModalOpen.value = false;
}

/* ---------------- 删除账号确认弹窗 ---------------- */

export const deleteTarget = ref<ManagedAccount | null>(null);

export function openDeleteAccount(account: ManagedAccount) {
  deleteTarget.value = account;
}

export function closeDeleteAccount() {
  deleteTarget.value = null;
}

/* ---------------- 环境提示弹窗 ---------------- */

export interface EnvNotice {
  title: string;
  text: string;
  primaryText: string;
  secondaryText?: string;
  type?: "error" | "warning";
  onPrimary?: () => void;
  onSecondary?: () => void;
}

export const envNotice = ref<EnvNotice | null>(null);

export function openEnvNotice(notice: EnvNotice) {
  envNotice.value = notice;
}

export function closeEnvNotice() {
  envNotice.value = null;
}

/* ---------------- 遮罩栈：Esc 只关闭最上层 ---------------- */

type OverlayId = "createKey" | "deleteAccount" | "env" | "accountDrawer";

const stack = computed<OverlayId[]>(() => {
  const list: OverlayId[] = [];
  // 后打开的在最上层，顺序与视觉层级保持一致
  if (accountDrawerOpen.value) list.push("accountDrawer");
  if (createKeyModalOpen.value) list.push("createKey");
  if (deleteTarget.value) list.push("deleteAccount");
  if (envNotice.value) list.push("env");
  return list;
});

/** 关闭当前最上层的弹层，返回是否处理了关闭。 */
export function closeTopOverlay(): boolean {
  const top = stack.value[stack.value.length - 1];
  if (!top) return false;

  if (top === "accountDrawer") closeAccountForm();
  else if (top === "createKey") closeCreateKeyModal();
  else if (top === "deleteAccount") closeDeleteAccount();
  else if (top === "env") closeEnvNotice();

  return true;
}
