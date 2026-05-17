# ACC 赛事结果分析

面向 **Assetto Corsa Competizione (ACC)** 的会话结果 JSON 可视化：排行榜、圈速与一致性等（Web 应用）。

## 技术栈

React、TypeScript、Vite、Recharts

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

## COS + STS（前端直连）配置

1. 安装依赖（已在项目中）：

```bash
npm install
```

2. 新建 `.env.local`（可参考 `.env.example`）：

```bash
VITE_RESULTS_SOURCE=cos
VITE_COS_REGION=ap-shanghai
VITE_COS_BUCKET=your-bucket-1250000000
VITE_COS_PREFIX=results/
VITE_STS_ENDPOINT=https://your-scf-domain/sts
VITE_COS_USE_SIGNED_URL=true
```

3. 本地运行：

```bash
npm run dev
```

4. Pages 构建：

```bash
npm run build:Pages
```

说明：
- `VITE_RESULTS_SOURCE=static` 时走本地 `public/results-index.json`。
- `VITE_RESULTS_SOURCE=cos` 时通过 STS + COS 拉取目录 JSON 列表。
- 前端不要放长期密钥（`SecretId/SecretKey`）。

## COS CORS 与最小权限建议

- CORS 允许来源：你的 Pages 域名（例如 `https://<user>.github.io`）。
- 方法：`GET`、`HEAD`，按需增加 `OPTIONS`。
- 允许头：`*` 或最小化到浏览器实际请求头。
- STS Policy 只放只读动作：`cos:GetBucket`、`cos:GetObject`。
- 资源限制到固定 `bucket` + `prefix`，不要给全桶写权限。
