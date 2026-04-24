/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_STS_ENDPOINT?: string;
  readonly VITE_COS_REGION?: string;
  readonly VITE_COS_BUCKET?: string;
  readonly VITE_COS_PREFIX?: string;
  readonly VITE_COS_USE_SIGNED_URL?: string;
  readonly VITE_RESULTS_SOURCE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
