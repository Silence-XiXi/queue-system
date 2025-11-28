import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  server: {
    host: '0.0.0.0', // 允许从其他设备访问
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000', // 使用 IPv4 地址而不是 localhost，避免 IPv6 解析问题
        changeOrigin: true,
        secure: false,
        ws: false,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, res) => {
            console.error('代理错误:', err.message);
          });
        }
      },
      '/socket.io': {
        target: 'http://127.0.0.1:3000', // 使用 IPv4 地址而不是 localhost
        ws: true,
        changeOrigin: true,
        secure: false
      }
    }
  }
});
