<div align="center">

# Zenith Image Generator

**现代化 AI 文生图 Web 应用**

支持多 AI 提供商的深色模式图片生成器，<br/>
批量生成，一键部署到 Cloudflare Pages。

[English](./README.md) · [更新日志](./docs/CHANGELOG.md) · [在线演示](https://zenith-image-generator.pages.dev)

![Dark Mode UI](https://img.shields.io/badge/UI-Dark%20Mode-1a1a1a)
![Cloudflare Pages](https://img.shields.io/badge/Deploy-Cloudflare%20Pages-F38020)
![React](https://img.shields.io/badge/React-19-61DAFB)
![Hono](https://img.shields.io/badge/Hono-4-E36002)

</div>

---

## 功能特性

- **多 AI 提供商** - A4F、Gitee AI、HuggingFace Spaces、ModelScope
- **深色模式 UI** - Gradio 风格毛玻璃效果
- **灵活尺寸** - 多种宽高比 (1:1, 16:9, 9:16, 4:3 等)
- **安全存储** - API Key 使用 AES-256-GCM 加密
- **Token 轮询** - 多 API Key 自动切换，遇到限流自动换用下一个
- **历史记录（轻量）** - 仅存元数据（URL + 参数）到 localStorage，24 小时自动过期清理
- **Flow 模式** - 可视化批量生成画布 (实验性)

## Token 轮询

支持为每个服务商配置多个 API Token，遇到限流错误 (429) 时自动切换。

### 使用方法

在 API 设置中输入多个 Token，用**英文逗号** (`,`) 分隔：

```
token_1, token_2, token_3
```

> **注意**：必须使用英文逗号 (`,`)，中文逗号 (`，`) 无效。

### 工作原理

1. 优先使用第一个可用的 Token 发起请求
2. 遇到 429 (限流) 错误时，自动切换到下一个 Token
3. 已耗尽的 Token 会被记录，当天不再使用
4. Token 状态每天 UTC 00:00 自动重置
5. 界面实时显示 Token 统计 (总数/可用/已耗尽)

## 快速开始

### 前置要求

- Node.js 18+ / pnpm 9+
- [Gitee AI API Key](https://ai.gitee.com)
- [A4F API Key](https://www.a4f.co)（可选）

### A4F（api.a4f.co）渠道：注册获取 API Key

1. 打开 https://www.a4f.co/ 注册/登录
2. 在 A4F 控制台创建 API Key（参考官方文档）：https://www.a4f.co/docs
3. 在 Zenith 设置中选择服务商 `A4F`，把 API Key 粘贴到 Token 输入框

说明：

- A4F 的模型必须带 provider 前缀（例如 `provider-4/imagen-3.5`），Zenith 已在模型下拉框内提供可用项。
- 如直接调用 OpenAI 兼容接口，请使用 `model: "a4f/provider-4/imagen-3.5"`，并在请求头中使用 `Authorization: Bearer a4f:<token>`。

### 一键部署

[![部署到 Cloudflare Pages](https://img.shields.io/badge/Deploy-Cloudflare%20Pages-F38020?style=for-the-badge&logo=cloudflare)](https://dash.cloudflare.com)

> 连接 GitHub 仓库 → 设置 root 为 `apps/web` → 部署！

### 本地开发

```bash
git clone https://github.com/WuMingDao/zenith-image-generator.git
cd zenith-image-generator
pnpm install

# 配置环境变量
cp apps/web/.env.example apps/web/.env

# 终端 1
pnpm dev:api

# 终端 2
pnpm dev:web
```

打开 `http://localhost:5173`

📖 **[完整开发指南](./docs/zh/CONTRIBUTING.md)**

## 文档

| 文档                                  | 描述                             |
| ------------------------------------- | -------------------------------- |
| [贡献指南](./docs/zh/CONTRIBUTING.md) | 本地配置、局域网访问、开发       |
| [部署指南](./docs/zh/DEPLOYMENT.md)   | Cloudflare、Vercel、Netlify 教程 |
| [API 参考](./docs/zh/API.md)          | 接口、参数、代码示例             |

补充说明：

- 接口返回的是**原始图片 URL**（例如 HuggingFace Space 的 `gradio_api/file=...`）。
- 部分 URL 是**临时文件**（HF Space 通常 24 小时左右会失效）。

## API 使用

部署后可直接调用 OpenAI 格式 API：

```bash
curl -X POST https://your-project.pages.dev/v1/images/generations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer gitee:your-gitee-api-key" \
  -d '{
    "model": "gitee/z-image-turbo",
    "prompt": "a cute cat",
    "size": "1024x1024",
    "steps": 9,
    "n": 1,
    "response_format": "url"
  }'
```

说明：

- Provider 路由通过 `model` 前缀区分：
  - `a4f/...` -> A4F（`Authorization: Bearer a4f:...`）
  - `gitee/...` -> Gitee AI（`Authorization: Bearer gitee:...`）
  - `ms/...` -> ModelScope（`Authorization: Bearer ms:...`）
  - 无前缀 -> HuggingFace（可选 token；`Authorization: Bearer <token>` 或 `Authorization: Bearer hf:<token>`）

### 图片编辑

`POST /v1/images/edits` 遵循 OpenAI 的 multipart 约定，现成的图片编辑客户端可直接使用：

```bash
curl -X POST https://your-project.pages.dev/v1/images/edits \
  -H "Authorization: Bearer ms:your-modelscope-token" \
  -F "model=ms/qwen-image-edit-2511" \
  -F "prompt=转成柔和的水彩风格，保留排版" \
  -F "image=@input.png"
```

也接受 JSON 请求体（`{"model":..., "prompt":..., "image":"data:image/png;base64,..."}`）。
与其他端点一致，`model` 必须带 provider 前缀（`ms/...`）；不带前缀会回落到
HuggingFace，在本接口会被拒绝。

这里只暴露**已实测会真正读取输入图**的模型。部分 ModelScope 模型会接受 `image_url`
却直接忽略，返回一张与原图无关的图——这类模型会被明确拒绝，而不是悄悄返回一张"假编辑"。
当前可用：`ms/qwen-image-edit-2511`、`ms/qwen-image-edit-2509`、`ms/qwen-image-edit`。

注意：Qwen 编辑模型可能把输出重新排版成与输入不同的画幅比例（实测 4:3 输入可能返回
3:5 竖图）。如果构图必须保持不变，请在提示词里明确要求。

## 安全性

### API Key 如何被保护

```
浏览器 ──HTTPS──→ Cloudflare Workers ──HTTPS──→ AI 服务商 (Gitee/HuggingFace)
  ↑                      ↑
AES-256-GCM          代理层
加密存储            (你的部署实例)
```

- **本地加密**：API Key 使用 AES-256-GCM 加密后存储在 localStorage
- **传输安全**：所有通信使用 HTTPS 加密
- **代理架构**：你的 Key 发送到你自己的 Workers，而非直接发给 AI 服务商

### ⚠️ 第三方部署警告

> **重要提示**：如果你使用他人部署的实例，部署者可能有能力获取你的 API Key。

原因如下：

1. 部署者可以添加日志代码来捕获请求头中的 Key
2. 你无法验证实际部署的代码是否与开源代码一致
3. Cloudflare 提供了 `wrangler tail` 等工具可以实时查看请求

**安全建议**：

| 场景 | 风险等级 | 建议 |
|------|----------|------|
| 自己部署 | ✅ 安全 | 完全掌控你的 Key |
| 第三方实例 | ⚠️ 有风险 | 仅使用一次性或低额度的 Key |
| 来源不明 | ❌ 不安全 | 不要输入有价值的 API Key |

**为了最大程度保障安全，请始终部署自己的实例。**

## 技术栈

| 层级 | 技术                                    |
| ---- | --------------------------------------- |
| 前端 | React 19, Vite, Tailwind CSS, shadcn/ui |
| 后端 | Hono (TypeScript)                       |
| 部署 | Cloudflare Pages + Functions            |

## star 历史

[![Star History Chart](https://api.star-history.com/svg?repos=WuMingDao/zenith-image-generator&type=date&legend=top-left)](https://www.star-history.com/#WuMingDao/zenith-image-generator&type=date&legend=top-left)

## 许可证

MIT

## 致谢

- [Gitee AI](https://ai.gitee.com) - z-image-turbo 模型
- [shadcn/ui](https://ui.shadcn.com) - UI 组件
- [Hono](https://hono.dev) - Web 框架
