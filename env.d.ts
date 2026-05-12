/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_STS_ENDPOINT?: string;
  readonly VITE_COS_REGION?: string;
  readonly VITE_COS_BUCKET?: string;
  readonly VITE_COS_PREFIX?: string;
  readonly VITE_COS_USE_SIGNED_URL?: string;
  readonly VITE_RESULTS_SOURCE?: string;
  /** 若设置，管理后台需输入相同密钥后写入 sessionStorage 方可访问 */
  readonly VITE_STANDINGS_ADMIN_KEY?: string;
  /** 榜单 API 根路径，默认空（同源 /api，开发时由 Vite 代理） */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
