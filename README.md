# Gaga Spider

网络爬虫项目 - 抓取小说、漫画等资源并保存到本地。

## 项目结构

```
gaga_spider/
├── frontend/    # React + Vite 前端
├── backend/     # NestJS 服务端
└── package.json # 根级 workspace 配置
```

## 环境要求

- Node.js >= 18（推荐 v20）

## 开发

```bash
# 安装所有依赖
npm install

# 同时启动前端和服务端
npm run dev

# 单独启动
npm run dev:frontend
npm run dev:backend
```

## 构建

```bash
npm run build
```

## 技术栈

- **前端**: React 18 + Vite + TypeScript
- **服务端**: NestJS + TypeScript
