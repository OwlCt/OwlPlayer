/// <reference types="vitest" />
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string }

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  publicDir: 'logo',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  esbuild: {
    // 生产环境移除 console.log 和 debugger
    drop: mode === 'production' ? ['console', 'debugger'] : [],
  },
  build: {
    // hls.js 本身就 522KB，调高警告阈值
    chunkSizeWarningLimit: 550,
    rollupOptions: {
      output: {
        manualChunks: {
          // React 核心库
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          // 大型动画库单独打包
          'framer-motion': ['framer-motion'],
          // HLS 视频播放库
          'hls': ['hls.js'],
          // 中文转换库
          'opencc': ['opencc-js'],
          // 拖拽库
          'dnd-kit': ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
          // 图标库
          'react-icons': ['react-icons'],
          // 滚动条库
          'scrollbar': ['overlayscrollbars', 'overlayscrollbars-react'],
          // 状态管理
          'zustand': ['zustand'],
          // HTTP 客户端
          'axios': ['axios'],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
}))
