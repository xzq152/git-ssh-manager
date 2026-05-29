# Git SSH Manager

`Git SSH Manager` 是一个基于 `Tauri 2 + 原生 HTML/CSS + TypeScript + Rust` 构建的桌面工具，用于在 Windows 环境下管理 Git SSH 多账号配置、工作区绑定以及新仓库克隆流程。

## 项目简介

这个工具主要解决以下问题：

- 同一台电脑需要同时使用多个 Git 账号
- 同一平台存在多个账号，例如多个 GitHub 或多个云效账号
- 不同工作区或不同仓库需要绑定不同 SSH 身份
- 新仓库克隆时，希望直接使用指定别名和密钥，而不是手动改 remote

## 主要功能

- 管理多个 SSH 账号与密钥
- 扫描 `~/.ssh` 中已有密钥并复用
- 支持同平台多账号，通过 `Host 别名` 区分身份
- 解析 Git 地址，自动识别平台、域名、命名空间和仓库名
- 扫描工作区下的子 Git 仓库，按勾选结果批量绑定
- 支持“新仓库模式”，可直接选择父目录并执行克隆
- 自动写入仓库的 `user.name`、`user.email` 和 `origin`
- 提供 Windows 可运行的桌面构建物

## 技术栈

- 前端：原生 `HTML`、`CSS`、`TypeScript`
- 桌面框架：`Tauri 2`
- 后端能力：`Rust`
- 前端构建：`Vite`

## 本地开发

### 安装依赖

```bash
pnpm install
```

### 启动开发环境

```bash
pnpm tauri dev
```

### 构建前端

```bash
pnpm build
```

### 构建 Windows 程序

```bash
pnpm tauri build
```

默认构建产物通常位于：

```text
src-tauri/target/release/git-ssh-manager.exe
```

## 使用说明

### 已有仓库模式

1. 填写平台、Host 别名、密钥文件名、邮箱、Git 用户名
2. 选择工作区目录
3. 扫描子 Git 仓库
4. 勾选需要绑定的仓库
5. 保存账号并绑定工作区

### 新仓库模式

1. 填写平台、Host 别名、密钥文件名、邮箱、Git 用户名
2. 输入 Git 地址
3. 选择父目录
4. 保存账号并克隆新仓库

## 开源说明

本项目采用 `MIT License` 开源。

你可以在遵守许可证条款的前提下：

- 使用
- 修改
- 分发
- 商业使用

详细条款请查看根目录下的 `LICENSE` 文件。

## 适用场景

- GitHub 多账号管理
- 云效 Codeup 多账号管理
- GitLab 多账号管理
- 按工作区区分 Git 身份
- 需要在 Windows 上快速切换 SSH 账号的开发环境
