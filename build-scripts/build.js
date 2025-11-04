const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 构建步骤
console.log('开始构建排队叫号系统...');

// 1. 构建前端
console.log('构建前端应用...');
execSync('cd client && npm run build', { stdio: 'inherit' });

// 2. 准备服务器目录
const serverDir = path.join(__dirname, '../server');
const publicDir = path.join(serverDir, 'public');
const clientDistDir = path.join(__dirname, '../client/dist');

// 清空旧的public目录
if (fs.existsSync(publicDir)) {
  fs.rmSync(publicDir, { recursive: true, force: true });
}
fs.mkdirSync(publicDir, { recursive: true });

// 3. 复制前端构建结果到服务器public目录
console.log('复制前端资源到服务器...');
fs.cpSync(clientDistDir, publicDir, { recursive: true });

// 4. 打包服务器应用
console.log('打包服务器应用...');
try {
  fs.mkdirSync(path.join(__dirname, '../dist'), { recursive: true });
  
  // 使用pkg打包
  execSync('npx pkg server/index.js --targets node16-win-x64 --output dist/queue-system', { 
    stdio: 'inherit',
    cwd: path.join(__dirname, '..')
  });
  
  console.log('打包完成! 可执行文件位于 dist/queue-system.exe');
} catch (error) {
  console.error('打包失败:', error);
}
