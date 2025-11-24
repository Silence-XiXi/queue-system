/**
 * 测试脚本：用于诊断模块加载问题
 * 在打包环境中运行此脚本来诊断模块加载问题
 */

const path = require('path');
const fs = require('fs');

const isPacked = typeof process.pkg !== 'undefined';
const execPath = process.execPath;
const execDir = path.dirname(execPath);
const externalNodeModules = path.join(execDir, 'node_modules');

console.log('========================================');
console.log('模块加载诊断工具');
console.log('========================================\n');

console.log('环境信息:');
console.log(`  打包环境: ${isPacked ? '是' : '否'}`);
console.log(`  可执行文件路径: ${execPath}`);
console.log(`  可执行文件目录: ${execDir}`);
console.log(`  外部 node_modules: ${externalNodeModules}`);
console.log(`  外部 node_modules 存在: ${fs.existsSync(externalNodeModules) ? '是' : '否'}\n`);

const moduleName = 'ffi-napi';
const modulePath = path.join(externalNodeModules, moduleName);

console.log(`检查模块: ${moduleName}`);
console.log(`  模块路径: ${modulePath}`);
console.log(`  模块存在: ${fs.existsSync(modulePath) ? '是' : '否'}\n`);

if (fs.existsSync(modulePath)) {
  const packageJsonPath = path.join(modulePath, 'package.json');
  const prebuildsPath = path.join(modulePath, 'prebuilds');
  const buildPath = path.join(modulePath, 'build', 'Release');
  
  console.log('模块结构:');
  console.log(`  package.json: ${fs.existsSync(packageJsonPath) ? '✓' : '✗'}`);
  console.log(`  prebuilds 目录: ${fs.existsSync(prebuildsPath) ? '✓' : '✗'}`);
  console.log(`  build/Release 目录: ${fs.existsSync(buildPath) ? '✓' : '✗'}\n`);
  
  if (fs.existsSync(prebuildsPath)) {
    console.log('prebuilds 目录内容:');
    try {
      const prebuildDirs = fs.readdirSync(prebuildsPath);
      prebuildDirs.forEach(dir => {
        const dirPath = path.join(prebuildsPath, dir);
        if (fs.statSync(dirPath).isDirectory()) {
          const files = fs.readdirSync(dirPath);
          const nodeFiles = files.filter(f => f.endsWith('.node'));
          console.log(`  ${dir}/: ${nodeFiles.length > 0 ? nodeFiles.join(', ') : '无 .node 文件'}`);
        }
      });
    } catch (e) {
      console.log(`  读取失败: ${e.message}`);
    }
    console.log('');
  }
  
  // 测试 node-gyp-build 是否能找到文件
  console.log('测试 node-gyp-build 解析:');
  try {
    const nodeGypBuild = require('node-gyp-build');
    const resolvedPath = nodeGypBuild.resolve(modulePath);
    console.log(`  ✓ node-gyp-build 解析成功`);
    console.log(`    路径: ${resolvedPath}`);
    console.log(`    文件存在: ${fs.existsSync(resolvedPath) ? '是' : '否'}`);
  } catch (e) {
    console.log(`  ✗ node-gyp-build 解析失败: ${e.message}`);
    console.log(`    错误详情: ${e.stack}`);
  }
  console.log('');
  
  // 测试直接 require
  console.log('测试直接 require:');
  try {
    // 设置环境变量
    process.env.FFI_NAPI_PREBUILD = modulePath;
    const originalNodePath = process.env.NODE_PATH;
    process.env.NODE_PATH = externalNodeModules;
    
    try {
      // 清除缓存
      const moduleKey = Object.keys(require.cache).find(key => key.includes(moduleName));
      if (moduleKey) {
        delete require.cache[moduleKey];
      }
      
      const module = require(moduleName);
      console.log(`  ✓ require 成功`);
      console.log(`    模块类型: ${typeof module}`);
    } catch (e) {
      console.log(`  ✗ require 失败: ${e.message}`);
      console.log(`    错误详情: ${e.stack ? e.stack.split('\n').slice(0, 5).join('\n') : '无堆栈信息'}`);
    } finally {
      if (originalNodePath !== undefined) {
        process.env.NODE_PATH = originalNodePath;
      } else {
        delete process.env.NODE_PATH;
      }
      delete process.env.FFI_NAPI_PREBUILD;
    }
  } catch (e) {
    console.log(`  ✗ 测试失败: ${e.message}`);
  }
}

console.log('\n========================================');
console.log('诊断完成');
console.log('========================================\n');

