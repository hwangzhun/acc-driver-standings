import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages 项目站为 https://<user>.github.io/<仓库名>/，需与仓库路径一致
const PAGES_BASE = '/ACC-Racing-Analytics/';

export default defineConfig(({ mode }) => ({
  // 默认相对路径，便于任意静态托管；npm run build:Pages 使用 mode=pages 走子路径 base
  base: mode === 'pages' ? PAGES_BASE : './',
  // 使用标准 public 目录，索引与 CSV 等静态文件从这里发布
  publicDir: 'public',
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    }
  }
}));
