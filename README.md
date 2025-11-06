# Queue System

一个基于Web的内网Queue System，适用于服务窗口叫号场景。

## 功能特点

- 五种业务类型叫号
- 分散式窗口叫号操作
- 大屏幕显示当前叫号状态
- 内网部署，不需要外网连接
- 语音播报叫号信息

## 系统结构

1. **取号机**：客人选择业务类型，取号，打印票据
2. **显示机**：显示当前排队情况、叫号时播放语音
3. **叫号机**：柜台工作人员使用，支持各种叫号操作

## 开发环境

### 技术栈

- **前端**：Vue.js + Element Plus + Socket.io Client
- **后端**：Node.js + Express + Socket.io + SQLite + Sequelize

### 安装依赖

```bash
# 安装根项目依赖
npm install

# 安装前端依赖
cd queueSystem-client
npm install

# 安装后端依赖
cd ../queueSystem-server
npm install
```

### 开发模式

```bash
# 同时启动前端和后端开发服务器
npm run dev

# 单独启动前端
npm run dev:client

# 单独启动后端
npm run dev:server
```

## 构建与部署

### 构建

```bash
npm run build
```

构建后的文件位于：
- 前端构建文件：`queueSystem-server/public/`
- 后端打包文件：`dist/queue-system.exe`

### 部署

```bash
npm run deploy
```

或手动部署：
1. 复制 `dist/queue-system.exe` 到目标服务器
2. 运行可执行文件启动服务

## 内网访问

服务启动后，可通过以下地址访问不同界面：

- 取号界面：`http://[服务器IP]/ticket`
- 显示界面：`http://[服务器IP]/display`
- 叫号界面：`http://[服务器IP]/counter`
