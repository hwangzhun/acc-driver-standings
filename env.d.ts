/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 榜单 API 根路径，默认空（同源 /api，开发时由 Vite 代理） */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
