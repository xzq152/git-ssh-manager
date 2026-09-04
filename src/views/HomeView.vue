<script setup lang="ts">
import { NIcon, NButton } from "naive-ui";
import { ArrowDownload24Regular, Key24Regular, Warning24Regular } from "@vicons/fluent";
import { PLATFORM_HOST_MAP } from "../types";
import { setTab } from "../ui";

interface Step {
  index: string;
  title: string;
  body: string;
}

const steps: Step[] = [
  {
    index: "1",
    title: "准备密钥",
    body: "在「账号与密钥」页创建新密钥，或复用 ~/.ssh 下已有的密钥；把公钥复制到 GitHub、云效、GitLab 等平台。",
  },
  {
    index: "2",
    title: "新建账号",
    body: "在「账号与密钥」页新建账号：选择平台、填写唯一的 Host 别名、密钥文件名与邮箱，保存后自动写入 SSH config。",
  },
  {
    index: "3",
    title: "绑定仓库",
    body: "选择工作区扫描子仓库并勾选，自动写入 user.name / user.email，并把 origin 改写为 git@别名 地址。",
  },
  {
    index: "4",
    title: "快速导入",
    body: "在「快速导入」页粘贴仓库地址、选择账号、自定义文件夹名，一键完成克隆并绑定。",
  },
];
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2 class="page-head__title">欢迎使用 Git 密钥管理器</h2>
        <p class="page-head__desc">一站式管理 Git SSH 多账号、工作区绑定与仓库克隆。</p>
      </div>
      <div style="display: flex; gap: 8px">
        <n-button size="small" secondary @click="setTab('accounts')">
          <template #icon><n-icon :component="Key24Regular" /></template>
          管理密钥
        </n-button>
        <n-button size="small" secondary @click="setTab('import')">
          <template #icon><n-icon :component="ArrowDownload24Regular" /></template>
          导入仓库
        </n-button>
      </div>
    </div>

    <div class="step-grid">
      <article v-for="step in steps" :key="step.index" class="card card--pad step-card">
        <span class="step-card__index">{{ step.index }}</span>
        <h3 class="step-card__title">{{ step.title }}</h3>
        <p class="step-card__body">{{ step.body }}</p>
      </article>
    </div>

    <div class="card card--pad note-card">
      <h3 class="note-card__title">多账号规则</h3>
      <p class="note-card__body">
        同一平台可配置多个账号，但每个账号必须使用唯一的 Host 别名（如
        <code>work-account</code>、<code>test-account</code>）。仓库 remote 应写成
        <code>git@别名:命名空间/仓库.git</code>，而不是真实域名（例如
        <code>{{ PLATFORM_HOST_MAP.codeup }}</code>）。
      </p>
    </div>

    <div class="card card--pad note-card">
      <h3 class="note-card__title">
        <n-icon :component="Warning24Regular" style="color: var(--warning)" />
        注意事项
      </h3>
      <p class="note-card__body">
        删除账号会移除其 SSH config 块与工作区绑定记录；「同时删除密钥文件」还会删除磁盘上的密钥文件，请谨慎操作。
        工作区内新增仓库后，可在「已管理账号」中点击该账号的「刷新」自动绑定。
      </p>
    </div>
  </div>
</template>
