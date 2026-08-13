# Gaga Spider

网络漫画/小说资源抓取与管理系统，支持多源站（Webtoons、动漫嗨）漫画抓取、本地存储、在线阅读和导出 PDF。

## 项目结构

```
gaga_spider/
├── frontend/    # React 19 + Vite 前端（PC 端，含抓取管理）
├── mobile/      # React 19 + Vite 前端（手机端，仅浏览/阅读/导出 PDF）
├── backend/     # NestJS 服务端
├── docs/        # 技术文档
└── package.json # 根级 workspace 配置
```

## 环境要求

- Node.js v20（推荐通过 nvm 管理）
- Python 3（系统自带）
- MySQL 8.0+
- macOS（PDF 导出依赖系统 sips）

## 开发

```bash
nvm use 20
npm install          # 安装前后端所有依赖
npm run dev          # 同时启动 PC前端(:5173)、后端(:3000)和手机端(:5174)

# 或单独启动
npm run dev:frontend
npm run dev:backend
npm run dev:mobile      # 手机端: http://localhost:5174
```

## 构建

```bash
npm run build
npm run start:backend   # 生产模式启动后端
```

## 技术栈

- **前端**: React 19 + Vite + TypeScript + React Router（PC 端 `frontend/` + 手机端 `mobile/`）
- **服务端**: NestJS + TypeORM + TypeScript + MySQL
- **抓取层**: Python urllib（绕过 TLS 指纹检测）+ cheerio 解析

## 文档

- [技术架构文档](docs/ARCHITECTURE.md) - 整体架构、数据模型、核心流程、扩展指南
- [使用文档](docs/USAGE.md) - 功能操作指南
- [API 接口文档](docs/api.md) - 所有后端接口说明
- [数据库设计](docs/database/schema-design.md) - 16 张表结构设计
- [抓取分析](docs/scraper/) - 各源站页面层级与采集规则

## 手机端

`mobile/` 是独立的手机端前端，与 PC 端共用后端，**只提供搜索/浏览/阅读/下载 PDF，不含抓取控制**，适合手机上看漫画。

```bash
npm run dev:mobile      # http://localhost:5174 （host:true，手机同局域网可访问）
```

详见 [使用文档](docs/USAGE.md) 第 8 节。
