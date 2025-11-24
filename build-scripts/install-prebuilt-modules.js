/**
 * 安装预编译的原生模块
 * 用于在缺少构建工具时使用预编译包
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const serverDir = path.join(__dirname, '../queueSystem-server');

console.log('========================================');
console.log('安装预编译原生模块');
console.log('========================================\n');

// 需要安装预编译包的模块列表
const nativeModules = [
  'ffi-napi',
  'ref-napi',
  'ref-struct-napi',
  'ref-array-napi'
];

console.log('正在安装预编译包...\n');

for (const moduleName of nativeModules) {
  try {
    console.log(`正在安装 ${moduleName}...`);
    
    // 方法1: 尝试使用 npm install 安装预编译包
    // 这些包会自动下载预编译的二进制文件（如果可用）
    execSync(`npm install ${moduleName} --force --no-audit`, {
      stdio: 'inherit',
      cwd: serverDir,
      maxBuffer: 10 * 1024 * 1024
    });
    
    // 验证是否成功安装
    const modulePath = path.join(serverDir, 'node_modules', moduleName);
    const buildPath = path.join(modulePath, 'build', 'Release');
    
    if (fs.existsSync(buildPath)) {
      const buildFiles = fs.readdirSync(buildPath);
      const hasBinary = buildFiles.some(file => file.endsWith('.node'));
      
      if (hasBinary) {
        const nodeFiles = buildFiles.filter(file => file.endsWith('.node'));
        console.log(`  ✓ ${moduleName} 安装成功`);
        console.log(`    二进制文件: ${nodeFiles.join(', ')}\n`);
      } else {
        console.warn(`  ⚠ ${moduleName} 安装完成，但未找到二进制文件`);
        console.warn(`    可能需要从源码构建\n`);
      }
    } else {
      console.warn(`  ⚠ ${moduleName} 安装完成，但 build 目录不存在`);
      console.warn(`    可能需要从源码构建\n`);
    }
  } catch (error) {
    console.error(`  ✗ ${moduleName} 安装失败: ${error.message}`);
    console.error(`    可能需要安装 Visual Studio Build Tools 并包含 Windows SDK\n`);
  }
}

console.log('========================================');
console.log('安装完成');
console.log('========================================\n');

console.log('提示:');
console.log('  1. 如果所有模块都成功安装，可以继续运行打包命令');
console.log('  2. 如果部分模块失败，请:');
console.log('     - 安装 Visual Studio Build Tools（包含 Windows SDK）');
console.log('     - 或手动运行: cd queueSystem-server && npm rebuild <模块名>');
console.log('  3. 验证安装: 检查 queueSystem-server/node_modules/<模块名>/build/Release/ 目录\n');

