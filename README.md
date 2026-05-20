# ACC 赛事结果分析

面向 **Assetto Corsa Competizione (ACC)** 的会话结果 JSON 可视化：排行榜、圈速与一致性等（Web 应用）。

## 技术栈

React、TypeScript、Vite、Express、SQLite

## 本地开发

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```

- **Pages**：`npm run build:Pages`

预览生产构建：`npm run preview`

## Docker 部署

所有服务（前端 + Express API + SQLite）打包在单一容器内，数据通过卷持久化。

### 前置条件

- Docker 24+
- Docker Compose v2

### 启动

```bash
# 1. 在项目根目录创建 .env（必须设置 ADMIN_PASSWORD）
echo "ADMIN_PASSWORD=你的强密码" > .env

# 2. 构建并后台启动
docker compose up -d --build

# 3. 访问
# 用户端: http://localhost:5174/
# 管理端: http://localhost:5174/admin.html
```

### 数据持久化

数据库文件（`standings.sqlite` 及其 WAL 附属文件）挂载在宿主机的 `./data` 目录，升级镜像或重启容器不会丢失。

**备份**（停止容器或确认无写入时执行）：

```bash
cp -r ./data ./data.backup
```

### 单独使用 Docker Run

```bash
docker build -t acc-standings .
docker run -d --name acc-standings \
  -p 5174:5174 \
  -e ADMIN_PASSWORD=你的强密码 \
  -e SQLITE_PATH=/data/standings.sqlite \
  -v "$(pwd)/data:/data" \
  acc-standings
```

## 本地开发（前后端）

```bash
npm install
npm run dev:all
```

- 用户端：http://localhost:3001/
- API：http://127.0.0.1:5174/api/health
- 管理端：http://localhost:3001/admin.html

环境变量见 `.env.example`（`ADMIN_PASSWORD` 等）。
