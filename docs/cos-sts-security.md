# COS STS 安全配置示例

## 1) STS 返回格式（前端兼容）

前端支持以下常见字段命名之一：

```json
{
  "credentials": {
    "tmpSecretId": "TMP_xxx",
    "tmpSecretKey": "xxx",
    "sessionToken": "xxx",
    "startTime": 1712600000,
    "expiredTime": 1712600900
  }
}
```

## 2) 推荐最小权限 Policy（只读）

把 `${APPID}`、`${BUCKET}`、`${PREFIX}` 替换成你的值：

```json
{
  "version": "2.0",
  "statement": [
    {
      "action": [
        "name/cos:GetBucket",
        "name/cos:GetObject"
      ],
      "effect": "allow",
      "resource": [
        "qcs::cos:${REGION}:uid/${APPID}:${BUCKET}-${APPID}/${PREFIX}*"
      ]
    }
  ]
}
```

## 3) COS CORS 建议

- AllowedOrigins: 仅你的 Pages 域名
- AllowedMethods: `GET`, `HEAD`
- AllowedHeaders: `*`（或按需最小化）
- ExposeHeaders: `ETag`, `Content-Length`
- MaxAgeSeconds: 300

## 4) 前端开关

- `VITE_RESULTS_SOURCE=cos`：启用 STS + COS 列目录
- `VITE_RESULTS_SOURCE=static`：回退本地 `public/results-index.json`
