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
