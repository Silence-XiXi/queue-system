/**
 * 动态加载打印机相关原生模块
 * 用于解决 pkg 打包时原生模块无法正确加载的问题
 */

function loadPrinterModules() {
  // 立即输出，确保即使后续出错也能看到
  try {
    console.log('========================================');
    console.log('loadPrinterModules() 开始执行');
    console.log('========================================');
  } catch (e) {
    // 如果 console.log 失败，至少尝试输出到 stderr
    process.stderr.write('loadPrinterModules() 开始执行\n');
  }
  
  const isPacked = typeof process.pkg !== 'undefined';
  const path = require('path');
  const fs = require('fs');
  
  console.log('开始加载打印机原生模块...');
  console.log(`  打包环境: ${isPacked ? '是' : '否'}`);
  console.log(`  当前工作目录: ${process.cwd()}`);
  console.log(`  __dirname: ${__dirname}`);
  
  if (isPacked) {
    // 打包环境：优先从外部 node_modules 加载（可执行文件同目录）
    // 这是最可靠的方案，因为原生模块的二进制文件可以正确加载
    const execPath = process.execPath;
    const execDir = path.dirname(execPath);
    const externalNodeModules = path.join(execDir, 'node_modules');
    
    console.log(`  可执行文件路径: ${execPath}`);
    console.log(`  可执行文件目录: ${execDir}`);
    console.log(`  外部 node_modules 路径: ${externalNodeModules}`);
    console.log(`  外部 node_modules 存在: ${fs.existsSync(externalNodeModules) ? '是' : '否'}`);
    
    // 需要加载的模块列表
    const modules = ['ffi-napi', 'ref-napi', 'ref-struct-napi', 'ref-array-napi'];
    const loadedModules = {};
    
    // 临时修改 module.paths 以包含外部 node_modules（最优先）
    const originalPaths = module.paths.slice();
    if (fs.existsSync(externalNodeModules)) {
      module.paths.unshift(externalNodeModules);
      console.log(`  ✓ 已将外部 node_modules 添加到模块搜索路径`);
    } else {
      console.warn(`  ⚠ 外部 node_modules 目录不存在: ${externalNodeModules}`);
    }
    
    try {
      for (const moduleName of modules) {
        let moduleLoaded = false;
        const attempts = [];
        
        // 方法1: 从外部 node_modules 加载（可执行文件同目录，最可靠）
        const externalModulePath = path.join(externalNodeModules, moduleName);
        console.log(`\n  尝试加载 ${moduleName}...`);
        console.log(`    外部路径: ${externalModulePath}`);
        console.log(`    外部路径存在: ${fs.existsSync(externalModulePath) ? '是' : '否'}`);
        
        if (fs.existsSync(externalModulePath)) {
          // 检查模块目录结构
          const packageJsonPath = path.join(externalModulePath, 'package.json');
          const indexJsPath = path.join(externalModulePath, 'index.js');
          const prebuildsPath = path.join(externalModulePath, 'prebuilds');
          const buildPath = path.join(externalModulePath, 'build', 'Release');
          
          console.log(`    package.json 存在: ${fs.existsSync(packageJsonPath) ? '是' : '否'}`);
          console.log(`    index.js 存在: ${fs.existsSync(indexJsPath) ? '是' : '否'}`);
          console.log(`    prebuilds 目录存在: ${fs.existsSync(prebuildsPath) ? '是' : '否'}`);
          console.log(`    build/Release 目录存在: ${fs.existsSync(buildPath) ? '是' : '否'}`);
          
          // 检查 prebuilds 目录中的文件
          if (fs.existsSync(prebuildsPath)) {
            try {
              const prebuildDirs = fs.readdirSync(prebuildsPath);
              console.log(`    prebuilds 子目录: ${prebuildDirs.join(', ')}`);
              
              const platform = process.platform === 'win32' ? 'win32' : process.platform;
              const arch = process.arch === 'x64' ? 'x64' : process.arch;
              const prebuildPlatformPath = path.join(prebuildsPath, `${platform}-${arch}`);
              
              if (fs.existsSync(prebuildPlatformPath)) {
                const prebuildFiles = fs.readdirSync(prebuildPlatformPath);
                const nodeFiles = prebuildFiles.filter(f => f.endsWith('.node'));
                console.log(`    prebuilds/${platform}-${arch}/ 中的 .node 文件: ${nodeFiles.join(', ') || '无'}`);
              }
            } catch (e) {
              console.log(`    读取 prebuilds 目录失败: ${e.message}`);
            }
          }
          
          try {
            // 清除 require 缓存（如果之前加载失败）
            const moduleKey = Object.keys(require.cache).find(key => key.includes(moduleName));
            if (moduleKey) {
              delete require.cache[moduleKey];
              console.log(`    已清除缓存: ${moduleKey}`);
            }
            
            // 设置环境变量帮助 node-gyp-build 找到正确的路径
            // node-gyp-build 支持通过环境变量指定模块路径
            // 同时，node-gyp-build 也会从 process.execPath 的目录查找 nearby 模块
            const envVarName = moduleName.toUpperCase().replace(/-/g, '_') + '_PREBUILD';
            const originalEnv = process.env[envVarName];
            
            // 设置环境变量指向外部模块路径
            process.env[envVarName] = externalModulePath;
            
            // 同时设置 NODE_PATH 确保模块能被找到
            const originalNodePath = process.env.NODE_PATH;
            if (originalNodePath) {
              process.env.NODE_PATH = `${externalNodeModules}${path.delimiter}${originalNodePath}`;
            } else {
              process.env.NODE_PATH = externalNodeModules;
            }
            
            try {
              // 尝试直接 require（因为已经修改了 module.paths）
              try {
                loadedModules[moduleName] = require(moduleName);
                console.log(`    ✓ 从外部 node_modules 加载 ${moduleName}（推荐方案）`);
                console.log(`      路径: ${externalModulePath}`);
                moduleLoaded = true;
              } catch (e) {
                console.log(`    直接 require 失败: ${e.message}`);
                console.log(`      错误详情: ${e.stack ? e.stack.split('\n').slice(0, 3).join('\n') : '无堆栈信息'}`);
                
                // 如果直接 require 失败，尝试 require 完整路径
                try {
                  loadedModules[moduleName] = require(externalModulePath);
                  console.log(`    ✓ 从外部 node_modules 加载 ${moduleName}（使用完整路径）`);
                  moduleLoaded = true;
                } catch (e2) {
                  console.log(`    完整路径 require 失败: ${e2.message}`);
                  console.log(`      错误详情: ${e2.stack ? e2.stack.split('\n').slice(0, 3).join('\n') : '无堆栈信息'}`);
                  attempts.push(`外部路径 ${externalModulePath} 加载失败: ${e.message} (完整路径: ${e2.message})`);
                }
              }
            } finally {
              // 恢复环境变量
              if (originalEnv !== undefined) {
                process.env[envVarName] = originalEnv;
              } else {
                delete process.env[envVarName];
              }
              
              // 恢复 NODE_PATH
              if (originalNodePath !== undefined) {
                process.env.NODE_PATH = originalNodePath;
              } else {
                delete process.env.NODE_PATH;
              }
            }
          } catch (e) {
            console.log(`    加载异常: ${e.message}`);
            console.log(`      错误堆栈: ${e.stack ? e.stack.split('\n').slice(0, 5).join('\n') : '无堆栈信息'}`);
            attempts.push(`外部路径 ${externalModulePath} 加载失败: ${e.message}`);
          }
        } else {
          attempts.push(`外部 node_modules 不存在: ${externalModulePath}`);
        }
        
        // 方法2: 如果外部加载失败，尝试从快照目录加载
        if (!moduleLoaded) {
          try {
            const snapshotPaths = [
              path.join(__dirname, '../node_modules', moduleName),
              path.join(process.cwd(), 'node_modules', moduleName),
            ];
            
            for (const modulePath of snapshotPaths) {
              if (fs.existsSync(modulePath)) {
                try {
                  loadedModules[moduleName] = require(modulePath);
                  console.log(`✓ 从快照目录加载 ${moduleName}: ${modulePath}`);
                  moduleLoaded = true;
                  break;
                } catch (e) {
                  attempts.push(`快照路径 ${modulePath} 加载失败: ${e.message}`);
                }
              }
            }
          } catch (error) {
            attempts.push('快照目录加载失败: ' + error.message);
          }
        }
        
        // 方法3: 直接 require（如果 pkg 已正确包含）
        if (!moduleLoaded) {
          try {
            loadedModules[moduleName] = require(moduleName);
            console.log(`✓ 从模块路径直接加载 ${moduleName}`);
            moduleLoaded = true;
          } catch (error) {
            attempts.push(`直接 require 失败: ${error.message}`);
          }
        }
        
        // 方法4: 如果 node-gyp-build 失败，尝试直接加载 .node 文件（仅对 ffi-napi 等特殊模块）
        if (!moduleLoaded && (moduleName === 'ffi-napi' || moduleName === 'ref-napi')) {
          try {
            const externalModulePath = path.join(externalNodeModules, moduleName);
            const platform = process.platform === 'win32' ? 'win32' : process.platform;
            const arch = process.arch === 'x64' ? 'x64' : process.arch;
            const prebuildPath = path.join(externalModulePath, 'prebuilds', `${platform}-${arch}`);
            
            if (fs.existsSync(prebuildPath)) {
              const prebuildFiles = fs.readdirSync(prebuildPath);
              const nodeFile = prebuildFiles.find(f => f.endsWith('.node'));
              
              if (nodeFile) {
                const nodeFilePath = path.join(prebuildPath, nodeFile);
                console.log(`    尝试直接加载 .node 文件: ${nodeFilePath}`);
                
                // 对于 ffi-napi，需要特殊处理
                if (moduleName === 'ffi-napi') {
                  // ffi-napi 需要通过 bindings.js 加载
                  const bindingsPath = path.join(externalModulePath, 'lib', 'bindings.js');
                  if (fs.existsSync(bindingsPath)) {
                    // 临时设置环境变量，让 node-gyp-build 找到正确的路径
                    const originalEnv = process.env.FFI_NAPI_PREBUILD;
                    process.env.FFI_NAPI_PREBUILD = externalModulePath;
                    try {
                      // 清除缓存
                      delete require.cache[bindingsPath];
                      const bindings = require(bindingsPath);
                      // ffi-napi 的导出结构
                      const ffiModule = require(path.join(externalModulePath, 'lib', 'ffi.js'));
                      loadedModules[moduleName] = ffiModule;
                      console.log(`    ✓ 通过直接加载 bindings 成功加载 ${moduleName}`);
                      moduleLoaded = true;
                    } finally {
                      if (originalEnv !== undefined) {
                        process.env.FFI_NAPI_PREBUILD = originalEnv;
                      } else {
                        delete process.env.FFI_NAPI_PREBUILD;
                      }
                    }
                  }
                } else {
                  // 对于其他模块，尝试直接 require .node 文件
                  try {
                    const nodeModule = require(nodeFilePath);
                    loadedModules[moduleName] = nodeModule;
                    console.log(`    ✓ 直接加载 .node 文件成功: ${moduleName}`);
                    moduleLoaded = true;
                  } catch (e) {
                    attempts.push(`直接加载 .node 文件失败: ${e.message}`);
                  }
                }
              }
            }
          } catch (error) {
            attempts.push(`备用加载方法失败: ${error.message}`);
          }
        }
        
        // 如果所有方法都失败
        if (!moduleLoaded) {
          console.error(`❌ 无法加载 ${moduleName}`);
          console.error(`  尝试的方法:`);
          attempts.forEach((attempt, index) => {
            console.error(`    ${index + 1}. ${attempt}`);
          });
          console.error(`\n解决方法:`);
          console.error(`   1. 确保 ${moduleName} 已正确安装: npm install ${moduleName}`);
          console.error(`   2. 重新构建原生模块: npm rebuild ${moduleName}`);
          console.error(`   3. 将 queueSystem-server/node_modules/${moduleName} 复制到可执行文件同目录下的 node_modules/${moduleName}`);
          console.error(`   4. 或考虑使用 PM2 直接运行 Node.js 代码（推荐）`);
          
          // 恢复原始路径
          module.paths = originalPaths;
          return null;
        }
      }
      
      // 恢复原始路径
      module.paths = originalPaths;
      return loadedModules;
    } catch (error) {
      // 恢复原始路径
      module.paths = originalPaths;
      console.error('加载打印机模块时发生错误:', error.message);
      return null;
    }
  } else {
    // 开发环境：直接 require
    try {
      return {
        'ffi-napi': require('ffi-napi'),
        'ref-napi': require('ref-napi'),
        'ref-struct-napi': require('ref-struct-napi'),
        'ref-array-napi': require('ref-array-napi')
      };
    } catch (error) {
      console.error('加载打印机模块失败:', error.message);
      return null;
    }
  }
}

/**
 * 获取打印机 DLL 路径
 * 在打包环境中，优先使用可执行文件同目录下的 printer_sdk
 */
function getPrinterDllPath() {
  const isPacked = typeof process.pkg !== 'undefined';
  const path = require('path');
  const fs = require('fs');
  
  // 如果设置了环境变量，优先使用
  if (process.env.PRINTER_DLL_PATH) {
    return process.env.PRINTER_DLL_PATH;
  }
  
  if (isPacked) {
    // 打包环境：优先使用可执行文件同目录下的 printer_sdk
    const execPath = process.execPath;
    const execDir = path.dirname(execPath);
    const externalPrinterSdk = path.join(execDir, 'printer_sdk', 'CsnPrinterLibs.dll');
    
    if (fs.existsSync(externalPrinterSdk)) {
      console.log(`✓ 使用外部 printer_sdk: ${externalPrinterSdk}`);
      return externalPrinterSdk;
    }
    
    // 如果外部不存在，尝试从快照目录加载
    const snapshotPaths = [
      path.join(__dirname, '../printer_sdk/CsnPrinterLibs.dll'),
      path.join(process.cwd(), 'printer_sdk/CsnPrinterLibs.dll'),
    ];
    
    for (const dllPath of snapshotPaths) {
      if (fs.existsSync(dllPath)) {
        console.log(`✓ 使用快照目录中的 DLL: ${dllPath}`);
        return dllPath;
      }
    }
    
    // 如果都不存在，返回默认路径（可能会失败，但至少会给出明确的错误）
    console.warn('⚠ 未找到打印机 DLL，使用默认路径');
    return path.join(__dirname, '../printer_sdk/CsnPrinterLibs.dll');
  } else {
    // 开发环境：使用项目目录下的 printer_sdk
    return path.join(__dirname, '../printer_sdk/CsnPrinterLibs.dll');
  }
}

module.exports = {
  loadPrinterModules,
  getPrinterDllPath
};

