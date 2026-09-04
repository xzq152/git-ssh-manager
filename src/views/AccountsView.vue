<script setup lang="ts">
import { computed, h, ref } from "vue";
import {
  NButton,
  NDataTable,
  NIcon,
  NPopover,
  NSpace,
  NTag,
  NText,
  NTooltip,
  useDialog,
  useMessage,
  type DataTableColumns,
} from "naive-ui";
import {
  Add24Regular,
  ArrowClockwise24Regular,
  ChevronDown24Regular,
  ChevronUp24Regular,
  Copy24Regular,
  Delete24Regular,
  Edit24Regular,
  Key24Regular,
  Warning24Regular,
} from "@vicons/fluent";
import AccountDetailPanel from "../components/AccountDetailPanel.vue";
import {
  copyText,
  deleteKey,
  loadDashboard,
  readPublicKey,
  refreshAccountWorkspaces,
  dashboard,
} from "../store";
import { openAccountForm, openCreateKeyModal, openDeleteAccount } from "../ui";
import { platformLabel, type ExistingKey, type ManagedAccount } from "../types";

const message = useMessage();
const dialog = useDialog();

const busyKey = ref("");
const busyAlias = ref("");
const expandedKeys = ref<string[]>([]);

/* ---------------- 同域名多账号提示 ---------------- */

const hostNotices = computed(() => {
  const groups = new Map<string, ManagedAccount[]>();
  for (const account of dashboard.managedAccounts) {
    const list = groups.get(account.hostName) ?? [];
    list.push(account);
    groups.set(account.hostName, list);
  }
  return Array.from(groups.entries()).filter(([, accounts]) => accounts.length > 1);
});

/* ---------------- 已有密钥 ---------------- */

const keyColumns: DataTableColumns<ExistingKey> = [
  {
    title: "密钥名",
    key: "keyName",
    width: 130,
    render: (row) => h("strong", row.keyName),
  },
  {
    title: "私钥路径",
    key: "keyPath",
    width: 180,
    render: (row) => h("span", { class: "path-cell", title: row.keyPath }, row.keyPath),
  },
  {
    title: "公钥路径",
    key: "publicKeyPath",
    width: 180,
    render: (row) => h("span", { class: "path-cell", title: row.publicKeyPath }, row.publicKeyPath),
  },
  {
    title: "关联账号",
    key: "managedHosts",
    width: 130,
    ellipsis: { tooltip: true },
    render: (row) =>
      h(NSpace, { size: 4, wrap: true }, () =>
        row.managedHosts.length
          ? row.managedHosts.map((host) =>
              h(NTag, { size: "small", bordered: false }, { default: () => host }),
            )
          : [h(NTag, { size: "small", bordered: false }, { default: () => "未绑定账号" })],
      ),
  },
  {
    title: "绑定仓库",
    key: "workspacePaths",
    width: 200,
    render: (row) => {
      if (!row.workspacePaths.length) {
        return h(NText, { depth: 3, style: "font-size:12px" }, { default: () => "未绑定仓库" });
      }

      const paths = row.workspacePaths;
      const cell = h(
        "div",
        { style: "display:flex;align-items:center;gap:6px;min-width:0" },
        [
          h(
            "span",
            { class: "path-cell", title: paths[0], style: "flex:1;max-width:none" },
            paths[0],
          ),
          h(
            NPopover,
            {
              trigger: "hover",
              placement: "left",
              style: "max-height:300px;overflow-y:auto;max-width:420px",
            },
            {
              trigger: () =>
                h(
                  NTag,
                  { size: "small", bordered: false, style: "cursor:default;flex:none" },
                  { default: () => `${paths.length} 个` },
                ),
              default: () =>
                h(
                  "div",
                  { style: "display:grid;gap:2px;word-break:break-all" },
                  paths.map((path) => h("div", { key: path }, path)),
                ),
            },
          ),
        ],
      );
      return cell;
    },
  },
  {
    title: "操作",
    key: "actions",
    width: 160,
    align: "right",
    fixed: "right",
    render: (row) =>
      h(NSpace, { justify: "end", size: 4, wrap: false }, () => [
        h(
          NButton,
          {
            size: "tiny",
            quaternary: true,
            loading: busyKey.value === `copy:${row.keyName}`,
            onClick: () => copyPublicKey(row.keyName),
          },
          { icon: () => h(NIcon, { component: Copy24Regular }), default: () => "复制公钥" },
        ),
        h(
          NButton,
          {
            size: "tiny",
            quaternary: true,
            type: "error",
            loading: busyKey.value === `delete:${row.keyName}`,
            onClick: () => confirmDeleteKey(row),
          },
          { icon: () => h(NIcon, { component: Delete24Regular }), default: () => "删除" },
        ),
      ]),
  },
];

async function copyPublicKey(keyName: string) {
  busyKey.value = `copy:${keyName}`;
  try {
    const content = await readPublicKey(keyName);
    const ok = await copyText(content);
    if (ok) message.success(`已复制公钥（${keyName}.pub）到剪贴板`);
    else message.error("公钥已读取，但写入剪贴板失败，请手动复制");
  } catch (error) {
    message.error(`复制失败：${String(error)}`);
  } finally {
    busyKey.value = "";
  }
}

function confirmDeleteKey(key: ExistingKey) {
  dialog.warning({
    title: "删除密钥",
    content: `确认删除密钥 ${key.keyName} 吗？这会同时移除关联账号，且磁盘上的密钥文件也会被删除。`,
    positiveText: "删除",
    negativeText: "取消",
    onPositiveClick: async () => {
      busyKey.value = `delete:${key.keyName}`;
      try {
        const result = await deleteKey(key.keyName);
        await loadDashboard();
        message.success(result);
      } catch (error) {
        message.error(`删除失败：${String(error)}`);
      } finally {
        busyKey.value = "";
      }
    },
  });
}

/* ---------------- 已管理账号 ---------------- */

function toggleDetail(alias: string) {
  expandedKeys.value = expandedKeys.value.includes(alias)
    ? expandedKeys.value.filter((item) => item !== alias)
    : [...expandedKeys.value, alias];
}

const accountColumns: DataTableColumns<ManagedAccount> = [
  { type: "expand", renderExpand: (row) => h(AccountDetailPanel, { account: row }) },
  { title: "别名", key: "hostAlias", width: 130, ellipsis: { tooltip: true }, render: (row) => h("strong", row.hostAlias) },
  {
    title: "平台",
    key: "platform",
    width: 100,
    render: (row) => h(NTag, { size: "small", bordered: false }, { default: () => platformLabel(row.platform) }),
  },
  { title: "域名", key: "hostName", width: 150, ellipsis: { tooltip: true }, render: (row) => h("span", { class: "mono" }, row.hostName) },
  { title: "账号", key: "user", width: 70, ellipsis: { tooltip: true }, render: (row) => row.user },
  {
    title: "邮箱",
    key: "email",
    minWidth: 150,
    ellipsis: { tooltip: true },
    render: (row) =>
      row.email
        ? row.email
        : h(NText, { depth: 3 }, { default: () => "未填写" }),
  },
  {
    title: "工作区",
    key: "workspaces",
    width: 90,
    render: (row) =>
      row.workspaces.length
        ? h(NTag, { size: "small", bordered: false }, { default: () => `${row.workspaces.length} 个` })
        : h(NText, { depth: 3 }, { default: () => "未绑定" }),
  },
  {
    title: "操作",
    key: "actions",
    width: 240,
    align: "right",
    fixed: "right",
    render: (row) =>
      h(NSpace, { justify: "end", size: 2, wrap: false }, () => [
        h(
          NButton,
          {
            size: "tiny",
            quaternary: true,
            onClick: () => toggleDetail(row.hostAlias),
          },
          {
            icon: () =>
              h(NIcon, {
                component: expandedKeys.value.includes(row.hostAlias)
                  ? ChevronUp24Regular
                  : ChevronDown24Regular,
              }),
            default: () => (expandedKeys.value.includes(row.hostAlias) ? "收起" : "详情"),
          },
        ),
        h(
          NButton,
          { size: "tiny", quaternary: true, onClick: () => openAccountForm(row) },
          { icon: () => h(NIcon, { component: Edit24Regular }), default: () => "编辑" },
        ),
        h(
          NTooltip,
          { trigger: "hover" },
          {
            trigger: () =>
              h(
                NButton,
                {
                  size: "tiny",
                  quaternary: true,
                  loading: busyAlias.value === `refresh:${row.hostAlias}`,
                  onClick: () => refreshWorkspaces(row.hostAlias),
                },
                { icon: () => h(NIcon, { component: ArrowClockwise24Regular }), default: () => "刷新" },
              ),
            default: () => "重新扫描已绑定工作区，自动绑定新增仓库",
          },
        ),
        h(
          NButton,
          {
            size: "tiny",
            quaternary: true,
            type: "error",
            loading: busyAlias.value === `delete:${row.hostAlias}`,
            onClick: () => openDeleteAccount(row),
          },
          { icon: () => h(NIcon, { component: Delete24Regular }), default: () => "删除" },
        ),
      ]),
  },
];

async function refreshWorkspaces(hostAlias: string) {
  busyAlias.value = `refresh:${hostAlias}`;
  try {
    const result = await refreshAccountWorkspaces(hostAlias);
    await loadDashboard();
    message.success(result);
  } catch (error) {
    message.error(`刷新失败：${String(error)}`);
  } finally {
    busyAlias.value = "";
  }
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2 class="page-head__title">账号与密钥</h2>
        <p class="page-head__desc">先检查 ~/.ssh 下已有的密钥，再管理账号与工作区绑定。</p>
      </div>
    </div>

    <!-- 已有密钥 -->
    <div class="section-head">
      <div>
        <h3 class="section-head__title">已有密钥</h3>
        <p class="section-head__desc">扫描 .ssh 下的私钥文件，可查看、复制公钥并执行删除。</p>
      </div>
      <n-button size="small" type="primary" @click="openCreateKeyModal">
        <template #icon><n-icon :component="Add24Regular" /></template>
        创建新密钥
      </n-button>
    </div>

    <n-data-table
      :columns="keyColumns"
      :data="dashboard.existingKeys"
      :row-key="(row: ExistingKey) => row.keyName"
      :scroll-x="960"
      :bordered="false"
      size="small"
    />

    <!-- 已管理账号 -->
    <div class="section-head">
      <div>
        <h3 class="section-head__title">已管理账号</h3>
        <p class="section-head__desc">展示已写入 SSH config 的账号，点击「详情」可展开查看完整信息。</p>
      </div>
      <n-button size="small" type="primary" @click="openAccountForm()">
        <template #icon><n-icon :component="Key24Regular" /></template>
        新建账号
      </n-button>
    </div>

    <div v-for="[hostName, accounts] in hostNotices" :key="hostName" class="host-notice">
      <n-icon class="host-notice__icon" :component="Warning24Regular" />
      <div style="min-width: 0">
        <div class="host-notice__title">{{ hostName }}</div>
        <p class="host-notice__body">
          检测到同域名多账号。请确保仓库 remote 使用 Host 别名，而不是直接写真实域名。
        </p>
        <div class="pill-group">
          <span v-for="account in accounts" :key="account.hostAlias" class="pill">
            {{ account.hostAlias }}
          </span>
        </div>
      </div>
    </div>

    <n-data-table
      v-model:expanded-row-keys="expandedKeys"
      :columns="accountColumns"
      :data="dashboard.managedAccounts"
      :row-key="(row: ManagedAccount) => row.hostAlias"
      :scroll-x="980"
      :bordered="false"
      size="small"
    />
  </div>
</template>
