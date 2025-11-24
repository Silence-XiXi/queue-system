const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 获取命令行参数
const args = process.argv.slice(2);
const targetPlatform = args.find(arg => arg.startsWith('--target'))?.split('=')[1] || 'win-x64';

// 自动检测 Node.js 版本并选择合适的 target
const currentNodeVersion = process.version; // 例如: v22.11.0
const majorVersion = parseInt(currentNodeVersion.match(/v(\d+)/)?.[1] || '18');
let nodeVersion = args.find(arg => arg.startsWith('--node'))?.split('=')[1];

// 如果没有指定版本，根据当前 Node.js 版本自动选择
// 注意：pkg 可能不支持某些版本，优先使用 node18（最稳定）
if (!nodeVersion) {
  // 检查 pkg 可用的版本
  let availableVersions = ['node18', 'node20', 'node16'];
  
  // 尝试检测 pkg 支持的版本
  try {
    const pkgInfo = execSync('npx pkg --help', { encoding: 'utf8', cwd: serverDir, stdio: 'pipe' });
    // 如果 node20 不可用，优先使用 node18
    if (majorVersion >= 20) {
      nodeVersion = 'node18';
      console.log(`检测到 Node.js ${currentNodeVersion}，使用 node18 目标（pkg 对 node18 支持最稳定）`);
    } else if (majorVersion >= 18) {
      nodeVersion = 'node18';
      console.log(`检测到 Node.js ${currentNodeVersion}，使用 node18 目标`);
    } else {
      nodeVersion = 'node16';
      console.log(`检测到 Node.js ${currentNodeVersion}，使用 node16 目标`);
    }
  } catch (e) {
    // 如果无法检测，默认使用 node18
    nodeVersion = 'node18';
    console.log(`检测到 Node.js ${currentNodeVersion}，默认使用 node18 目标`);
  }
}

// 构建步骤
console.log('========================================');
console.log('开始构建 Queue System 可执行文件...');
console.log('========================================\n');

// 1. 构建前端
console.log('步骤 1/5: 构建前端应用...');
try {
  execSync('cd queueSystem-client && npm run build', { stdio: 'inherit' });
  console.log('✓ 前端构建完成\n');
} catch (error) {
  console.error('✗ 前端构建失败:', error.message);
  process.exit(1);
}

// 2. 准备服务器目录和数据库文件
console.log('步骤 2/5: 准备服务器目录和数据库文件...');
const serverDir = path.join(__dirname, '../queueSystem-server');
const publicDir = path.join(serverDir, 'public');
const clientDistDir = path.join(__dirname, '../queueSystem-client/dist');
const databasePath = path.join(serverDir, 'database.sqlite');

// 清空旧的public目录
if (fs.existsSync(publicDir)) {
  fs.rmSync(publicDir, { recursive: true, force: true });
}
fs.mkdirSync(publicDir, { recursive: true });

// 检查数据库文件是否存在，如果不存在则提示
if (!fs.existsSync(databasePath)) {
  console.warn('⚠ 警告: 数据库文件不存在，将创建空数据库');
  console.warn('   建议: 在打包前先运行一次服务器以初始化数据库\n');
} else {
  const stats = fs.statSync(databasePath);
  const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  console.log(`✓ 找到数据库文件: ${fileSizeMB} MB`);
  console.log('  数据库文件将被打包到可执行文件中\n');
}

// 3. 复制前端构建结果到服务器public目录
console.log('步骤 3/6: 复制前端资源到服务器...');
try {
  if (!fs.existsSync(clientDistDir)) {
    throw new Error('前端构建输出目录不存在: ' + clientDistDir);
  }
  fs.cpSync(clientDistDir, publicDir, { recursive: true });
  
  // 验证关键文件是否存在
  const indexHtmlPath = path.join(publicDir, 'index.html');
  if (!fs.existsSync(indexHtmlPath)) {
    throw new Error('前端构建结果中缺少 index.html 文件');
  }
  
  // 列出 public 目录中的文件（用于调试）
  const publicFiles = fs.readdirSync(publicDir);
  console.log(`✓ 前端资源复制完成 (${publicFiles.length} 个文件/目录)`);
  console.log(`  ✓ index.html 已确认存在\n`);
} catch (error) {
  console.error('✗ 复制前端资源失败:', error.message);
  process.exit(1);
}

// 4. 重新构建原生模块（确保 sqlite3 和打印机相关模块针对当前 Node.js 版本正确编译）
console.log('步骤 4/6: 重新构建原生模块...');
console.log(`  当前 Node.js 版本: ${currentNodeVersion}`);
console.log(`  目标打包版本: ${nodeVersion}`);
console.log('  正在重新构建原生模块（sqlite3, ffi-napi, ref-napi 等）...\n');

// 需要重新构建的原生模块列表
const nativeModules = [
  'sqlite3',
  'ffi-napi',
  'ref-napi',
  'ref-struct-napi',
  'ref-array-napi'
];

// 检查构建工具是否可用
let buildToolsAvailable = true;
try {
  // 尝试运行 node-gyp 检查
  execSync('node-gyp --version', { 
    stdio: 'pipe',
    cwd: serverDir
  });
} catch (error) {
  buildToolsAvailable = false;
  console.warn('  ⚠ 警告: 无法检测构建工具，可能缺少 Visual Studio Build Tools 或 Windows SDK');
  console.warn('    如果原生模块已正确构建，可以继续打包');
  console.warn('    如果打包后运行出错，请安装 Visual Studio Build Tools 并包含 Windows SDK\n');
}

const buildResults = {};
for (const moduleName of nativeModules) {
  try {
    console.log(`  正在处理 ${moduleName}...`);
    
    // 检查模块是否已存在且包含二进制文件
    // node-gyp-build 优先从 prebuilds 目录加载，然后才是 build/Release
    const modulePath = path.join(serverDir, 'node_modules', moduleName);
    const buildPath = path.join(modulePath, 'build', 'Release');
    const prebuildsPath = path.join(modulePath, 'prebuilds');
    let hasBinary = false;
    let binaryLocation = null;
    
    // 检查 prebuilds 目录（优先）
    if (fs.existsSync(prebuildsPath)) {
      // 查找匹配平台的预编译文件
      const platform = process.platform === 'win32' ? 'win32' : process.platform;
      const arch = process.arch === 'x64' ? 'x64' : process.arch;
      const prebuildPlatformPath = path.join(prebuildsPath, `${platform}-${arch}`);
      
      if (fs.existsSync(prebuildPlatformPath)) {
        const prebuildFiles = fs.readdirSync(prebuildPlatformPath);
        const hasPrebuild = prebuildFiles.some(file => file.endsWith('.node'));
        if (hasPrebuild) {
          hasBinary = true;
          binaryLocation = 'prebuilds';
        }
      }
    }
    
    // 检查 build/Release 目录（备用）
    if (!hasBinary && fs.existsSync(buildPath)) {
      const buildFiles = fs.readdirSync(buildPath);
      hasBinary = buildFiles.some(file => file.endsWith('.node'));
      if (hasBinary) {
        binaryLocation = 'build/Release';
      }
    }
    
    if (hasBinary) {
      console.log(`    ℹ ${moduleName} 已存在二进制文件（位置: ${binaryLocation}），跳过重新构建`);
      buildResults[moduleName] = { success: true, skipped: true, hasBinary: true, location: binaryLocation };
      continue;
    }
    
    // 方法1: 尝试使用预编译包（prebuild-install）
    // 这些包（ffi-napi, ref-napi 等）支持预编译包，优先使用
    console.log(`    尝试使用预编译包（prebuild-install）...`);
    try {
      // 先尝试安装预编译包
      execSync(`npm install ${moduleName} --prefer-offline --no-audit`, { 
        stdio: 'pipe',
        cwd: serverDir,
        maxBuffer: 10 * 1024 * 1024
      });
      
      // 检查是否成功获取了二进制文件
      if (fs.existsSync(buildPath)) {
        const buildFiles = fs.readdirSync(buildPath);
        const hasNewBinary = buildFiles.some(file => file.endsWith('.node'));
        if (hasNewBinary) {
          console.log(`    ✓ ${moduleName} 使用预编译包成功`);
          buildResults[moduleName] = { success: true, hasBinary: true, method: 'prebuild' };
          continue;
        }
      }
    } catch (prebuildError) {
      console.log(`    预编译包不可用，将尝试从源码构建`);
    }
    
    // 方法2: 尝试从源码重新构建（需要构建工具）
    console.log(`    尝试从源码构建...`);
    execSync(`npm rebuild ${moduleName}`, { 
      stdio: 'inherit',
      cwd: serverDir,
      maxBuffer: 10 * 1024 * 1024
    });
    
    // 验证构建结果
    if (fs.existsSync(buildPath)) {
      const buildFiles = fs.readdirSync(buildPath);
      const hasNewBinary = buildFiles.some(file => file.endsWith('.node'));
      if (hasNewBinary) {
        console.log(`  ✓ ${moduleName} 从源码构建完成\n`);
        buildResults[moduleName] = { success: true, hasBinary: true, method: 'build' };
      } else {
        console.warn(`  ⚠ ${moduleName} 构建完成，但未找到二进制文件\n`);
        buildResults[moduleName] = { success: false, hasBinary: false, reason: '未找到二进制文件' };
      }
    } else {
      console.warn(`  ⚠ ${moduleName} 构建完成，但 build 目录不存在\n`);
      buildResults[moduleName] = { success: false, hasBinary: false, reason: 'build 目录不存在' };
    }
  } catch (error) {
    console.warn(`  ⚠ 警告: ${moduleName} 处理失败`);
    console.warn(`    错误: ${error.message}`);
    
    // 检查是否至少存在旧的二进制文件
    const modulePath = path.join(serverDir, 'node_modules', moduleName);
    const buildPath = path.join(modulePath, 'build', 'Release');
    let hasOldBinary = false;
    
    if (fs.existsSync(buildPath)) {
      const buildFiles = fs.readdirSync(buildPath);
      hasOldBinary = buildFiles.some(file => file.endsWith('.node'));
      if (hasOldBinary) {
        console.warn(`    ℹ 发现已存在的二进制文件，将使用现有版本`);
        buildResults[moduleName] = { success: false, hasBinary: true, reason: '使用已存在的二进制文件' };
      } else {
        buildResults[moduleName] = { success: false, hasBinary: false, reason: '处理失败且无二进制文件' };
      }
    } else {
      buildResults[moduleName] = { success: false, hasBinary: false, reason: '处理失败且无 build 目录' };
    }
    
    console.warn(`   如果打包后运行出错，请尝试:`);
    console.warn(`     1. 使用预编译包（推荐）:`);
    console.warn(`        cd queueSystem-server`);
    console.warn(`        npm install ${moduleName} --force`);
    console.warn(`     2. 或安装 Visual Studio Build Tools（包含 Windows SDK）后重新构建`);
    console.warn(`     3. 或手动运行: cd queueSystem-server && npm rebuild ${moduleName}\n`);
  }
}

// 验证关键模块的二进制文件
console.log('\n  正在验证原生模块二进制文件...');
let allModulesValid = true;

// 验证 sqlite3
const sqlite3NodePath = path.join(serverDir, 'node_modules', 'sqlite3', 'build', 'Release', 'node_sqlite3.node');
if (fs.existsSync(sqlite3NodePath)) {
  const stats = fs.statSync(sqlite3NodePath);
  console.log(`  ✓ sqlite3 二进制文件存在 (${(stats.size / 1024).toFixed(2)} KB)`);
} else {
  console.warn('  ⚠ 警告: sqlite3 二进制文件未找到');
  console.warn(`    预期路径: ${sqlite3NodePath}`);
  allModulesValid = false;
}

// 验证打印机相关模块
// 注意：这些模块使用 node-gyp-build，优先从 prebuilds 目录加载
const printerModules = ['ffi-napi', 'ref-napi', 'ref-struct-napi', 'ref-array-napi'];
for (const moduleName of printerModules) {
  const modulePath = path.join(serverDir, 'node_modules', moduleName);
  const buildPath = path.join(modulePath, 'build', 'Release');
  const prebuildsPath = path.join(modulePath, 'prebuilds');
  let foundBinary = false;
  let binaryLocation = null;
  
  // 检查 prebuilds 目录（优先）
  if (fs.existsSync(prebuildsPath)) {
    const platform = process.platform === 'win32' ? 'win32' : process.platform;
    const arch = process.arch === 'x64' ? 'x64' : process.arch;
    const prebuildPlatformPath = path.join(prebuildsPath, `${platform}-${arch}`);
    
    if (fs.existsSync(prebuildPlatformPath)) {
      const prebuildFiles = fs.readdirSync(prebuildPlatformPath);
      const nodeFiles = prebuildFiles.filter(file => file.endsWith('.node'));
      
      if (nodeFiles.length > 0) {
        const nodeFile = nodeFiles[0];
        const nodeFilePath = path.join(prebuildPlatformPath, nodeFile);
        const stats = fs.statSync(nodeFilePath);
        console.log(`  ✓ ${moduleName} 预编译文件存在: prebuilds/${platform}-${arch}/${nodeFile} (${(stats.size / 1024).toFixed(2)} KB)`);
        foundBinary = true;
        binaryLocation = 'prebuilds';
      }
    }
  }
  
  // 检查 build/Release 目录（备用）
  if (!foundBinary && fs.existsSync(buildPath)) {
    const buildFiles = fs.readdirSync(buildPath);
    const nodeFiles = buildFiles.filter(file => file.endsWith('.node'));
    
    if (nodeFiles.length > 0) {
      const nodeFile = nodeFiles[0];
      const nodeFilePath = path.join(buildPath, nodeFile);
      const stats = fs.statSync(nodeFilePath);
      console.log(`  ✓ ${moduleName} 二进制文件存在: build/Release/${nodeFile} (${(stats.size / 1024).toFixed(2)} KB)`);
      foundBinary = true;
      binaryLocation = 'build/Release';
    }
  }
  
  if (!foundBinary) {
    console.warn(`  ⚠ 警告: ${moduleName} 未找到二进制文件`);
    console.warn(`    检查了: prebuilds/${process.platform}-${process.arch}/ 和 build/Release/`);
    allModulesValid = false;
  }
}

// 验证 printer_sdk 目录
const printerSdkPath = path.join(serverDir, 'printer_sdk');
if (fs.existsSync(printerSdkPath)) {
  const sdkFiles = fs.readdirSync(printerSdkPath);
  console.log(`  ✓ printer_sdk 目录存在 (${sdkFiles.length} 个文件)`);
  sdkFiles.forEach(file => {
    const filePath = path.join(printerSdkPath, file);
    if (fs.statSync(filePath).isFile()) {
      const stats = fs.statSync(filePath);
      console.log(`    - ${file} (${(stats.size / 1024).toFixed(2)} KB)`);
    }
  });
} else {
  console.warn('  ⚠ 警告: printer_sdk 目录不存在');
  console.warn('    打印机功能可能无法正常工作');
  allModulesValid = false;
}

if (!allModulesValid) {
  console.warn('\n  ⚠ 警告: 部分原生模块的二进制文件缺失');
  console.warn('    这可能导致打包后程序无法正常运行');
  console.warn('    建议:');
  console.warn('      1. 安装 Visual Studio Build Tools（包含 Windows SDK）');
  console.warn('      2. 重新运行打包命令');
  console.warn('      3. 或确保开发环境中已正确构建这些模块');
  console.warn('      4. 如果继续打包，请确保 dist/node_modules 中包含完整的模块文件\n');
} else {
  console.log('\n  ✓ 所有原生模块验证通过\n');
}

// 5. 打包服务器应用
console.log('步骤 5/6: 打包服务器应用为可执行文件...');
try {
  const distDir = path.join(__dirname, '../dist');
  fs.mkdirSync(distDir, { recursive: true });
  
  // 构建 pkg 命令
  const pkgTarget = `${nodeVersion}-${targetPlatform}`;
  const outputName = targetPlatform.includes('win') ? 'queue-system.exe' : 'queue-system';
  
  // 使用绝对路径，并确保路径格式正确（Windows 使用反斜杠）
  const outputPath = path.resolve(distDir, outputName);
  // 对于 pkg 命令，使用正斜杠或反斜杠都可以，但使用绝对路径更可靠
  const outputPathForPkg = outputPath.replace(/\\/g, '/'); // pkg 在 Windows 上也接受正斜杠
  
  console.log(`  目标平台: ${pkgTarget}`);
  console.log(`  输出文件: ${outputPath}`);
  console.log(`  工作目录: ${serverDir}\n`);
  
  // 检查并删除旧的可执行文件（如果存在）
  if (fs.existsSync(outputPath)) {
    console.log('  检测到旧的可执行文件，正在删除...');
    try {
      // 尝试删除文件
      fs.unlinkSync(outputPath);
      console.log('  ✓ 旧文件已删除\n');
    } catch (error) {
      if (error.code === 'EPERM' || error.code === 'EBUSY') {
        console.error('\n❌ 错误: 无法删除旧的可执行文件');
        console.error('   文件可能正在运行或被其他程序占用');
        console.error('\n解决方法:');
        console.error('   1. 关闭所有正在运行的 queue-system.exe 进程');
        console.error('   2. 关闭可能占用该文件的程序（如杀毒软件、文件管理器）');
        console.error('   3. 或手动删除文件: ' + outputPath);
        console.error('   4. 然后重新运行打包命令\n');
        process.exit(1);
      } else {
        throw error;
      }
    }
  }
  
  // 验证 public 目录在打包前存在且包含必要文件
  const publicIndexHtml = path.join(serverDir, 'public', 'index.html');
  if (!fs.existsSync(publicIndexHtml)) {
    throw new Error('public/index.html 不存在，无法打包。请确保前端构建已完成并已复制到 public 目录。');
  }
  
  // 列出 public 目录中的关键文件
  const publicDir = path.join(serverDir, 'public');
  const publicFiles = fs.existsSync(publicDir) ? fs.readdirSync(publicDir, { withFileTypes: true }) : [];
  const publicFileCount = publicFiles.length;
  const hasAssets = fs.existsSync(path.join(publicDir, 'assets'));
  
  console.log('  ✓ 已验证 public/index.html 存在');
  console.log(`  ✓ public 目录包含 ${publicFileCount} 个项目`);
  if (hasAssets) {
    const assetsFiles = fs.readdirSync(path.join(publicDir, 'assets'));
    console.log(`  ✓ public/assets 目录包含 ${assetsFiles.length} 个文件`);
  }
  
  // 使用pkg打包，明确指定 assets 路径
  // 注意：pkg 的 assets 路径是相对于入口文件的
  // 入口文件是 queueSystem-server/index.js，所以 public 目录在同一目录下
  console.log('  正在使用 pkg 打包（这可能需要几分钟）...');
  
  // 验证 package.json 中的 pkg 配置
  const packageJsonPath = path.join(serverDir, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  
  if (!packageJson.pkg || !packageJson.pkg.assets) {
    throw new Error('package.json 中缺少 pkg.assets 配置');
  }
  
  console.log('  ✓ package.json 中的 pkg 配置已确认');
  console.log(`    包含 ${packageJson.pkg.assets.length} 个 assets 配置`);
  console.log(`    assets 列表: ${packageJson.pkg.assets.join(', ')}`);
  
  // 验证 pkg.config.json 是否存在（如果存在，pkg 也会读取它）
  const pkgConfigPath = path.join(serverDir, 'pkg.config.json');
  if (fs.existsSync(pkgConfigPath)) {
    console.log('  ✓ 发现 pkg.config.json，pkg 也会读取此配置');
  }
  
  // 验证所有需要打包的文件是否存在
  console.log('  正在验证需要打包的文件...');
  const requiredFiles = [
    path.join(serverDir, 'public', 'index.html'),
    path.join(serverDir, 'database.sqlite')
  ];
  
  for (const filePath of requiredFiles) {
    if (!fs.existsSync(filePath)) {
      console.warn(`  ⚠ 警告: ${path.relative(serverDir, filePath)} 不存在`);
    } else {
      console.log(`  ✓ ${path.relative(serverDir, filePath)} 存在`);
    }
  }
  console.log('');
  
  // 构建 pkg 命令
  // 使用 package.json 中的配置，同时通过命令行参数明确指定
  // 在 Windows 上，使用正斜杠可能更可靠
  // 注意：pkg 的 assets 路径是相对于入口文件的，所以使用相对路径
  // 构建 pkg 命令，使用绝对路径
  // 注意：sqlite3 的二进制文件需要明确包含
  // 明确指定 .node 文件的完整路径
  const sqlite3NodeFile = path.join(serverDir, 'node_modules', 'sqlite3', 'build', 'Release', 'node_sqlite3.node');
  const sqlite3NodeFileForPkg = sqlite3NodeFile.replace(/\\/g, '/');
  
  // pkg 的 assets 路径是相对于入口文件的
  // 入口文件是 queueSystem-server/index.js，所以 public 目录在同一目录下
  // 使用相对路径（相对于 index.js）
  const publicDirRelative = 'public';
  const publicIndexHtmlRelative = 'public/index.html';
  
  // 构建 assets 参数列表
  // 注意：pkg 的 assets 路径是相对于入口文件（index.js）的
  // 由于我们在 queueSystem-server 目录执行，相对路径应该是正确的
  // package.json 中的配置会被自动读取，命令行参数作为补充
  const assetsList = [
    // 使用相对路径（相对于 index.js，即 queueSystem-server 目录）
    `"${publicDirRelative}"`,              // public 目录
    `"${publicDirRelative}/**/*"`,         // public 目录下所有文件
    `"${publicIndexHtmlRelative}"`,        // 明确指定 index.html
    // 其他资源
    '"generated-models-auto"',
    '"models"',
    '"database.sqlite"',
    '"printer_sdk"',                       // printer_sdk 目录
    '"printer_sdk/**/*"',                  // printer_sdk 下所有文件
    '"printer.config.json"',               // 打印机配置文件
    '"node_modules/sqlite3"',
    `"${sqlite3NodeFileForPkg}"`,          // sqlite3 二进制文件
    '"node_modules/ffi-napi"',            // 打印机相关原生模块
    '"node_modules/ref-napi"',
    '"node_modules/ref-struct-napi"',
    '"node_modules/ref-array-napi"'
  ];
  
  // 注意：package.json 中的 pkg.assets 配置会被 pkg 自动读取
  // 命令行参数是额外的补充，确保所有文件都被包含
  const pkgCommand = `npx pkg index.js --targets ${pkgTarget} --output "${outputPathForPkg}" ${assetsList.map(a => `--assets ${a}`).join(' ')}`;
  
  console.log('  打包命令（在 queueSystem-server 目录执行）:');
  console.log(`    npx pkg index.js`);
  console.log(`    --targets ${pkgTarget}`);
  console.log(`    --output "${outputPathForPkg}"`);
  console.log(`    --assets "${publicDirRelative}" (public 目录)`);
  console.log(`    --assets "${publicDirRelative}/**/*" (public 下所有文件)`);
  console.log(`    --assets "${publicIndexHtmlRelative}" (index.html)`);
  console.log(`    --assets "generated-models-auto"`);
  console.log(`    --assets "models"`);
  console.log(`    --assets "database.sqlite"`);
  console.log(`    --assets "printer_sdk" (打印机 SDK 目录)`);
  console.log(`    --assets "printer_sdk/**/*" (打印机 SDK 所有文件)`);
  console.log(`    --assets "printer.config.json" (打印机配置文件)`);
  console.log(`    --assets "node_modules/sqlite3"`);
  console.log(`    --assets "${sqlite3NodeFileForPkg}" (sqlite3 二进制文件)`);
  console.log(`    --assets "node_modules/ffi-napi" (打印机原生模块)`);
  console.log(`    --assets "node_modules/ref-napi"`);
  console.log(`    --assets "node_modules/ref-struct-napi"`);
  console.log(`    --assets "node_modules/ref-array-napi"`);
  console.log('');
  console.log(`  工作目录: ${serverDir}`);
  console.log(`  public 目录绝对路径: ${path.join(serverDir, 'public')}`);
  console.log(`  index.html 绝对路径: ${publicIndexHtml}`);
  console.log(`  index.html 是否存在: ${fs.existsSync(publicIndexHtml) ? '是' : '否'}`);
  console.log(`  注意: pkg 会同时读取 package.json 中的 pkg.assets 配置`);
  console.log(`  package.json 中的 assets 配置:`);
  packageJson.pkg.assets.forEach((asset, index) => {
    console.log(`    ${index + 1}. ${asset}`);
  });
  console.log('');
  console.log('  重要提示: 如果仍然报错，可能是 pkg 版本问题或路径解析问题');
  console.log('  建议: 确保在 queueSystem-server 目录下执行 pkg 命令');
  console.log('');
  console.log('  注意: 所有资源将打包到可执行文件内部');
  console.log('  提示: 如果 sqlite3 加载失败，请将 node_modules/sqlite3 复制到可执行文件同目录\n');
  
  try {
    // 先尝试使用 inherit 模式（显示实时输出）
    // 如果失败，会捕获错误并显示详细信息
    execSync(pkgCommand, { 
      stdio: 'inherit',
      cwd: serverDir,  // 在 queueSystem-server 目录执行
      shell: true,     // 在 Windows 上使用 shell
      maxBuffer: 10 * 1024 * 1024 // 增加缓冲区大小（10MB）
    });
    
    // 验证文件是否生成
    if (fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath);
      const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
      console.log(`\n✓ 可执行文件已成功生成！`);
      console.log(`  文件路径: ${outputPath}`);
      console.log(`  文件大小: ${fileSizeMB} MB\n`);
    } else {
      console.error('\n❌ 错误: 可执行文件未在预期位置生成');
      console.error(`  预期路径: ${outputPath}`);
      
      // 检查其他可能的位置
      const possibleLocations = [
        path.join(serverDir, outputName), // queueSystem-server 目录
        path.join(process.cwd(), outputName), // 当前工作目录
        path.join(__dirname, outputName) // build-scripts 目录
      ];
      
      let foundInOtherLocation = false;
      for (const possiblePath of possibleLocations) {
        if (fs.existsSync(possiblePath)) {
          const stats = fs.statSync(possiblePath);
          const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
          console.error(`\n⚠ 发现文件在其他位置: ${possiblePath}`);
          console.error(`  文件大小: ${fileSizeMB} MB`);
          console.error(`  建议: 手动移动文件到 dist 目录\n`);
          foundInOtherLocation = true;
        }
      }
      
      if (!foundInOtherLocation) {
        console.error('\n可能的原因:');
        console.error('  1. pkg 打包失败（请查看上方的错误信息）');
        console.error('  2. 输出路径不正确');
        console.error('  3. 权限问题');
        console.error('  4. 磁盘空间不足');
        console.error('\n请检查:');
        console.error(`  - dist 目录是否存在: ${distDir}`);
        console.error(`  - 是否有写入权限`);
        console.error(`  - pkg 命令是否成功执行`);
        console.error(`  - 检查 queueSystem-server 目录下是否有生成的文件\n`);
      }
    }
  } catch (error) {
    console.error('\n❌ pkg 打包失败');
    console.error('  错误信息:', error.message);
    
    // 显示更详细的错误信息
    if (error.stderr) {
      console.error('\n  详细错误输出:');
      console.error(error.stderr.toString());
    }
    if (error.stdout) {
      console.error('\n  标准输出:');
      console.error(error.stdout.toString());
    }
    
    console.error(`\n预期输出文件: ${outputPath}`);
    console.error(`  工作目录: ${serverDir}`);
    console.error(`  打包命令: ${pkgCommand}`);
    
    // 检查是否有部分生成的文件
    const distFiles = fs.existsSync(distDir) ? fs.readdirSync(distDir) : [];
    if (distFiles.length > 0) {
      console.error('\n  发现 dist 目录中的文件:');
      distFiles.forEach(file => {
        const filePath = path.join(distDir, file);
        try {
          const stats = fs.statSync(filePath);
          console.error(`    - ${file} (${(stats.size / 1024).toFixed(2)} KB)`);
        } catch (e) {
          console.error(`    - ${file} (无法读取)`);
        }
      });
    }
    
    // 检查 pkg 是否安装
    console.error('\n诊断信息:');
    try {
      const pkgVersion = execSync('npx pkg --version', { encoding: 'utf8', cwd: serverDir }).trim();
      console.error(`  ✓ pkg 版本: ${pkgVersion}`);
    } catch (e) {
      console.error('  ✗ 无法获取 pkg 版本，可能未正确安装');
      console.error('    请运行: npm install -g pkg 或 npm install pkg');
    }
    
    console.error('\n解决方法:');
    console.error('  1. 检查上方的详细错误信息');
    console.error('  2. 确保所有依赖已正确安装: cd queueSystem-server && npm install');
    console.error('  3. 尝试手动运行 pkg 命令进行调试:');
    console.error(`     cd queueSystem-server`);
    console.error(`     npx pkg index.js --targets ${pkgTarget} --output "${outputPathForPkg}"`);
    console.error('  4. 检查磁盘空间是否充足');
    console.error('  5. 检查是否有杀毒软件阻止');
    console.error('  6. 尝试以管理员权限运行\n');
    throw error; // 重新抛出错误，让外层 catch 处理
  }
  
  // 注意：大部分资源打包到可执行文件内部，但 pic 目录保留在外部以便用户自定义
  console.log('  提示: 资源打包说明');
  console.log('    ✓ public 目录 - 打包到可执行文件内部');
  console.log('    ✓ sqlite3 模块 - 打包到可执行文件内部（包含二进制文件）');
  console.log('    ✓ printer_sdk 目录 - 打包到可执行文件内部');
  console.log('    ✓ 打印机原生模块 - 打包到可执行文件内部（ffi-napi, ref-napi 等）');
  console.log('    ✓ pic 目录 - 保留在外部（可执行文件同目录下），方便用户自定义图片');
  console.log('\n  重要提示: 如果运行时原生模块加载失败（pkg 对原生模块支持有限）');
  console.log('    将自动复制原生模块和 printer_sdk 到外部目录作为备用方案...');
  
  // 自动复制 public 目录到 dist 目录作为备用方案（pkg 对 public 目录支持可能有问题）
  console.log('  正在复制 public 目录到 dist 目录（备用方案）...');
  try {
    const publicSource = path.join(serverDir, 'public');
    const publicDest = path.join(distDir, 'public');
    
    if (fs.existsSync(publicSource)) {
      // 如果目标已存在，先删除
      if (fs.existsSync(publicDest)) {
        fs.rmSync(publicDest, { recursive: true, force: true });
      }
      
      // 复制 public 目录
      fs.cpSync(publicSource, publicDest, { recursive: true });
      console.log('    ✓ public 目录已复制到 dist/public（备用方案）');
      console.log('      如果打包内的 public 无法加载，程序会自动使用外部版本\n');
    } else {
      console.warn('    ⚠ public 源目录不存在，跳过复制\n');
    }
  } catch (error) {
    console.warn('    ⚠ 复制 public 目录失败（不影响打包）:', error.message);
    console.warn('      如果运行时出错，请手动将 queueSystem-server/public 复制到 dist/public\n');
  }
  
  // 自动复制 sqlite3 到 dist 目录作为备用方案
  console.log('  正在复制 sqlite3 模块到 dist 目录（备用方案）...');
  try {
    const sqlite3Source = path.join(serverDir, 'node_modules', 'sqlite3');
    const sqlite3Dest = path.join(distDir, 'node_modules', 'sqlite3');
    
    if (fs.existsSync(sqlite3Source)) {
      // 创建 node_modules 目录
      const nodeModulesDir = path.join(distDir, 'node_modules');
      if (!fs.existsSync(nodeModulesDir)) {
        fs.mkdirSync(nodeModulesDir, { recursive: true });
      }
      
      // 如果目标已存在，先删除
      if (fs.existsSync(sqlite3Dest)) {
        fs.rmSync(sqlite3Dest, { recursive: true, force: true });
      }
      
      // 复制 sqlite3 模块
      fs.cpSync(sqlite3Source, sqlite3Dest, { recursive: true });
      console.log('    ✓ sqlite3 已复制到 dist/node_modules/sqlite3（备用方案）');
      console.log('      如果打包内的 sqlite3 无法加载，程序会自动使用外部版本\n');
    } else {
      console.warn('    ⚠ sqlite3 源目录不存在，跳过复制\n');
    }
  } catch (error) {
    console.warn('    ⚠ 复制 sqlite3 失败（不影响打包）:', error.message);
    console.warn('      如果运行时出错，请手动将 queueSystem-server/node_modules/sqlite3 复制到 dist/node_modules/sqlite3\n');
  }
  
  // 自动复制打印机相关原生模块到 dist 目录作为备用方案
  console.log('  正在复制打印机相关原生模块到 dist 目录（备用方案）...');
  const printerNativeModules = ['ffi-napi', 'ref-napi', 'ref-struct-napi', 'ref-array-napi'];
  
  const nodeModulesDir = path.join(distDir, 'node_modules');
  if (!fs.existsSync(nodeModulesDir)) {
    fs.mkdirSync(nodeModulesDir, { recursive: true });
  }
  
  // 递归复制模块及其所有依赖
  const copiedModules = new Set();
  
  function copyModuleAndDependencies(moduleName, depth = 0) {
    if (copiedModules.has(moduleName) || depth > 5) {
      return; // 避免循环依赖和过深递归
    }
    
    const moduleSource = path.join(serverDir, 'node_modules', moduleName);
    const moduleDest = path.join(distDir, 'node_modules', moduleName);
    
    if (!fs.existsSync(moduleSource)) {
      return;
    }
    
    // 复制模块本身
    if (!copiedModules.has(moduleName)) {
      try {
        if (fs.existsSync(moduleDest)) {
          fs.rmSync(moduleDest, { recursive: true, force: true });
        }
        fs.cpSync(moduleSource, moduleDest, { recursive: true });
        copiedModules.add(moduleName);
        
        if (depth === 0) {
          console.log(`    ✓ ${moduleName} 已复制`);
        } else {
          console.log(`      ✓ 依赖 ${moduleName} 已复制`);
        }
      } catch (error) {
        console.warn(`      ⚠ 复制 ${moduleName} 失败: ${error.message}`);
        return;
      }
    }
    
    // 读取 package.json 获取依赖
    try {
      const packageJsonPath = path.join(moduleDest, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        const dependencies = packageJson.dependencies || {};
        
        // 只复制运行时依赖（dependencies），不复制开发依赖（devDependencies）
        for (const depName of Object.keys(dependencies)) {
          // 跳过 Node.js 内置模块和已经复制的模块
          if (!copiedModules.has(depName) && !depName.startsWith('@')) {
            const depSource = path.join(serverDir, 'node_modules', depName);
            if (fs.existsSync(depSource)) {
              copyModuleAndDependencies(depName, depth + 1);
            }
          }
        }
      }
    } catch (error) {
      // 忽略读取 package.json 的错误
    }
  }
  
  // 先复制所有依赖（递归）
  console.log('    正在复制模块及其依赖（递归）...');
  for (const moduleName of printerNativeModules) {
    copyModuleAndDependencies(moduleName);
  }
  console.log(`    已复制 ${copiedModules.size} 个模块（包括所有依赖）`);
  console.log(`    已复制的模块: ${Array.from(copiedModules).join(', ')}\n`);
  
  // 验证已复制的模块
  console.log('    正在验证已复制的模块...');
  for (const moduleName of printerNativeModules) {
    const moduleDest = path.join(distDir, 'node_modules', moduleName);
    
    if (fs.existsSync(moduleDest)) {
      // 检查源模块是否有二进制文件
      const buildDestDir = path.join(moduleDest, 'build');
      const buildDestReleaseDir = path.join(buildDestDir, 'Release');
      const prebuildsDestDir = path.join(moduleDest, 'prebuilds');
      let hasBinary = false;
      let binaryLocation = null;
      
      // 检查 prebuilds 目录（优先）
      if (fs.existsSync(prebuildsDestDir)) {
        const platform = process.platform === 'win32' ? 'win32' : process.platform;
        const arch = process.arch === 'x64' ? 'x64' : process.arch;
        const prebuildPlatformPath = path.join(prebuildsDestDir, `${platform}-${arch}`);
        
        if (fs.existsSync(prebuildPlatformPath)) {
          const prebuildFiles = fs.readdirSync(prebuildPlatformPath);
          const nodeFiles = prebuildFiles.filter(file => file.endsWith('.node'));
          hasBinary = nodeFiles.length > 0;
          if (hasBinary) {
            binaryLocation = 'prebuilds';
          }
        }
      }
      
      // 检查 build/Release 目录（备用）
      if (!hasBinary && fs.existsSync(buildDestReleaseDir)) {
        const buildFiles = fs.readdirSync(buildDestReleaseDir);
        const nodeFiles = buildFiles.filter(file => file.endsWith('.node'));
        hasBinary = nodeFiles.length > 0;
        if (hasBinary) {
          binaryLocation = 'build/Release';
        }
      }
      
      // 验证关键文件
      const packageJsonPath = path.join(moduleDest, 'package.json');
      const hasPackageJson = fs.existsSync(packageJsonPath);
      
      console.log(`    ✓ ${moduleName}: package.json=${hasPackageJson ? '✓' : '✗'}, 二进制文件=${hasBinary ? `✓ (${binaryLocation})` : '✗'}`);
      
      if (!hasBinary) {
        console.warn(`      ⚠ 警告: ${moduleName} 未找到二进制文件`);
      }
    } else {
      console.warn(`    ⚠ ${moduleName} 未复制成功`);
    }
  }
  console.log('      如果打包内的打印机模块无法加载，程序会自动使用外部版本\n');
  
  // 自动复制 printer_sdk 目录到 dist 目录作为备用方案
  console.log('  正在复制 printer_sdk 目录到 dist 目录（备用方案）...');
  try {
    const printerSdkSource = path.join(serverDir, 'printer_sdk');
    const printerSdkDest = path.join(distDir, 'printer_sdk');
    
    if (fs.existsSync(printerSdkSource)) {
      // 如果目标已存在，先删除
      if (fs.existsSync(printerSdkDest)) {
        fs.rmSync(printerSdkDest, { recursive: true, force: true });
      }
      
      // 复制 printer_sdk 目录
      fs.cpSync(printerSdkSource, printerSdkDest, { recursive: true });
      console.log('    ✓ printer_sdk 已复制到 dist/printer_sdk（备用方案）');
      console.log('      如果打包内的 printer_sdk 无法加载，程序会自动使用外部版本\n');
    } else {
      console.warn('    ⚠ printer_sdk 源目录不存在，跳过复制');
      console.warn('      打印机功能可能无法正常工作\n');
    }
  } catch (error) {
    console.warn('    ⚠ 复制 printer_sdk 失败（不影响打包）:', error.message);
    console.warn('      如果运行时出错，请手动将 queueSystem-server/printer_sdk 复制到 dist/printer_sdk\n');
  }
  
  // 自动复制 printer.config.json 到 dist 目录（外部配置文件，用户可以修改）
  console.log('  正在复制 printer.config.json 到 dist 目录（外部配置文件）...');
  try {
    const printerConfigSource = path.join(serverDir, 'printer.config.json');
    const printerConfigDest = path.join(distDir, 'printer.config.json');
    
    if (fs.existsSync(printerConfigSource)) {
      // 复制配置文件（如果目标已存在，会覆盖）
      fs.copyFileSync(printerConfigSource, printerConfigDest);
      console.log('    ✓ printer.config.json 已复制到 dist/printer.config.json');
      console.log('      用户可以直接编辑此文件来修改打印机配置\n');
    } else {
      console.warn('    ⚠ printer.config.json 源文件不存在，跳过复制');
      console.warn('      程序将使用默认配置或环境变量\n');
    }
  } catch (error) {
    console.warn('    ⚠ 复制 printer.config.json 失败（不影响打包）:', error.message);
    console.warn('      如果运行时出错，请手动将 queueSystem-server/printer.config.json 复制到 dist/printer.config.json\n');
  }
  
} catch (error) {
  console.error('✗ 打包失败:', error.message);
  console.error('\n提示: 如果遇到原生模块问题，请尝试:');
  console.error('  1. 确保已安装所有依赖: npm install');
  console.error('  2. 重新构建原生模块:');
  console.error('     cd queueSystem-server');
  console.error('     npm rebuild sqlite3 ffi-napi ref-napi ref-struct-napi ref-array-napi');
  console.error(`  3. 当前 Node.js 版本: ${currentNodeVersion}`);
  console.error(`  4. 目标打包版本: ${nodeVersion}`);
  console.error('\n注意: pkg 对 Node.js v22 的支持可能不完整');
  console.error('  如果问题持续，建议:');
  console.error('  - 使用 Node.js v18 或 v20（更稳定，推荐）');
  console.error('  - 或使用 --node=node18 或 --node=node20 参数');
  console.error('  - 将 node_modules/sqlite3 复制到可执行文件同目录下');
  console.error('  - 使用 PM2 直接运行 Node.js 代码（推荐）\n');
  process.exit(1);
}

// 6. 创建外部资源目录和说明文件
console.log('步骤 6/6: 创建外部资源目录...');
try {
  const distDir = path.join(__dirname, '../dist');
  
  // 创建图片目录
  const distPicDir = path.join(distDir, 'pic');
  if (!fs.existsSync(distPicDir)) {
    fs.mkdirSync(distPicDir, { recursive: true });
  }
  
  // 复制默认图片到外部目录（作为示例）
  const sourcePicDir = path.join(__dirname, '../queueSystem-client/public/pic');
  if (fs.existsSync(sourcePicDir)) {
    try {
      fs.cpSync(sourcePicDir, distPicDir, { recursive: true, force: false });
      console.log('✓ 已复制默认图片到外部目录');
    } catch (error) {
      console.warn('⚠ 复制默认图片失败（不影响打包）:', error.message);
    }
  }
  
  // 创建图片说明文件
  const picReadmePath = path.join(distPicDir, 'README.txt');
  const picReadmeContent = `图片自定义说明
================

此文件夹用于存放自定义图片文件。

支持的图片文件：
- ticket_bg.jpg - 取票页面背景图片
- display_bg.png - 显示屏背景图片

使用方法：
1. 将您想要使用的图片文件放在此文件夹中
2. 确保文件名与上述文件名一致
3. 重启应用程序即可生效

注意：
- 如果此文件夹中没有对应的图片文件，程序将使用打包内的默认图片
- 支持的图片格式：JPG、PNG、GIF等Web浏览器支持的格式
- 建议图片尺寸：
  * ticket_bg.jpg: 建议宽度 1920px 或以上
  * display_bg.png: 建议宽度 1920px 或以上

您也可以通过管理员后台的系统设置页面修改图片路径。
`;
  fs.writeFileSync(picReadmePath, picReadmeContent, 'utf8');
  
  // 创建数据库目录说明
  const dbReadmePath = path.join(distDir, '数据库说明.txt');
  const dbReadmeContent = `数据库文件说明
================

数据库文件 (database.sqlite) 已包含在可执行文件中。

首次运行说明：
- 程序首次运行时会自动将打包的数据库文件复制到可执行文件同目录下
- 如果可执行文件目录下已存在 database.sqlite，将使用现有数据库
- 如果不存在，将从打包资源中复制初始数据库文件

重要提示：
- 数据库文件包含所有业务数据，请定期备份
- 打包的数据库文件作为初始模板，实际数据存储在可执行文件同目录下的 database.sqlite
- 不要删除或移动数据库文件，否则会导致数据丢失

数据库位置：
- 默认位置: 可执行文件同目录下的 database.sqlite
- 可以通过环境变量 DATABASE_PATH 指定其他位置

备份建议：
- 定期备份可执行文件同目录下的 database.sqlite 文件
- 建议使用备份脚本或手动复制文件进行备份
`;
  fs.writeFileSync(dbReadmePath, dbReadmeContent, 'utf8');
  
  // 创建使用说明文件
  const usageReadmePath = path.join(distDir, '使用说明.txt');
  const usageReadmeContent = `Queue System 使用说明
====================

一、启动应用
-----------
1. 双击运行 queue-system.exe
2. 程序会自动启动服务器（默认端口: 3000）
3. 在浏览器中访问以下地址：
   - 取票页面: http://【IP地址】:3000/ticket
   - 显示屏: http://【IP地址】:3000/display
   - 叫号机: http://【IP地址】:3000/counter
   - 管理员: http://【IP地址】:3000/admin

二、配置说明
-----------
1. 图片自定义: 将图片文件放在 pic/ 文件夹中（详见 pic/README.txt）
2. 数据库: 数据库文件会自动创建在可执行文件同目录下（详见 数据库说明.txt）
3. 端口配置: 可通过环境变量 PORT 修改端口（默认: 3000）

三、停止应用
-----------
直接关闭命令行窗口或按 Ctrl+C 停止服务器

四、常见问题
-----------
1. 端口被占用: 修改环境变量 PORT 或关闭占用端口的程序
2. 数据库错误: 检查 database.sqlite 文件权限
3. 图片不显示: 检查 pic/ 文件夹中的图片文件是否存在

五、故障排除
-----------
如果程序启动失败或立即退出：
1. 双击运行 "运行诊断.bat" 进行诊断
2. 或在命令行中运行 queue-system.exe 查看详细错误信息
3. 查看 "README-故障排除.txt" 获取详细帮助

技术支持
--------
如有问题，请查看项目文档或联系技术支持。
`;
  fs.writeFileSync(usageReadmePath, usageReadmeContent, 'utf8');
  
  // 创建诊断批处理文件
  const diagnosticBatPath = path.join(distDir, '运行诊断.bat');
  const diagnosticBatContent = `@echo off
chcp 65001 >nul
echo ========================================
echo Queue System 诊断工具
echo ========================================
echo.
echo 此工具将帮助您诊断程序启动问题
echo.

REM 检查当前目录
if not exist "queue-system.exe" (
    echo [错误] 未找到 queue-system.exe
    echo 请确保此批处理文件与 queue-system.exe 在同一目录
    pause
    exit /b 1
)

echo [1/5] 检查可执行文件...
if exist "queue-system.exe" (
    echo ✓ queue-system.exe 存在
    for %%A in (queue-system.exe) do echo   文件大小: %%~zA 字节
) else (
    echo ✗ queue-system.exe 不存在
    pause
    exit /b 1
)

echo.
echo [2/5] 检查端口占用...
netstat -ano | findstr :3000 >nul
if %errorlevel% == 0 (
    echo ⚠ 警告: 端口 3000 已被占用
    echo   正在查找占用端口的进程...
    netstat -ano | findstr :3000
    echo.
    echo   解决方法:
    echo   1. 关闭占用端口的程序
    echo   2. 或使用其他端口: set PORT=8080
) else (
    echo ✓ 端口 3000 未被占用
)

echo.
echo [3/5] 检查数据库文件...
if exist "database.sqlite" (
    echo ✓ database.sqlite 存在
    for %%A in (database.sqlite) do echo   文件大小: %%~zA 字节
    for %%A in (database.sqlite) do echo   修改时间: %%~tA
) else (
    echo ⚠ database.sqlite 不存在（首次运行时会自动创建）
)

echo.
echo [4/5] 检查目录权限...
cd . >nul 2>&1
if %errorlevel% == 0 (
    echo ✓ 当前目录可写
) else (
    echo ✗ 当前目录不可写，可能缺少权限
)

echo.
echo [5/5] 准备启动程序...
echo.
echo ========================================
echo 正在启动 queue-system.exe...
echo ========================================
echo.
echo 提示: 如果程序启动失败，错误信息将显示在下方
echo 请仔细查看错误信息，按任意键继续...
pause >nul
echo.

REM 运行程序（不自动关闭窗口）
cd /d "%~dp0"
queue-system.exe

echo.
echo ========================================
echo 程序已退出
echo ========================================
echo.
echo 如果程序立即退出，请查看上方的错误信息
echo.
pause
`;
  fs.writeFileSync(diagnosticBatPath, diagnosticBatContent, 'utf8');
  
  // 创建故障排除文档
  const troubleshootingPath = path.join(distDir, 'README-故障排除.txt');
  const troubleshootingContent = `Queue System 故障排除指南
==========================

如果双击 queue-system.exe 后程序立即退出，请按以下步骤排查：

一、使用诊断工具
---------------
1. 双击运行 "运行诊断.bat"
2. 查看诊断结果
3. 按照提示修复问题

二、在命令行中运行（查看详细错误）
----------------------------------
1. 打开命令提示符（CMD）或 PowerShell
2. 进入 dist 目录：
   cd C:\\路径\\到\\dist
3. 运行程序：
   queue-system.exe
4. 查看完整的错误信息

三、常见问题及解决方法
--------------------

问题 1: 端口被占用
------------------
错误信息: Error: listen EADDRINUSE: address already in use :::3000

解决方法:
1. 查找占用端口的进程:
   netstat -ano | findstr :3000
2. 结束进程（替换 PID 为实际进程ID）:
   taskkill /PID <PID> /F
3. 或使用其他端口:
   set PORT=8080
   queue-system.exe

问题 2: 数据库初始化失败
------------------------
错误信息: 数据库初始化失败: ...

可能原因:
- 数据库文件损坏
- 文件权限不足
- 磁盘空间不足

解决方法:
1. 删除 database.sqlite 文件（如果存在）
2. 重新运行程序，让程序创建新数据库
3. 检查目录权限，确保可写
4. 检查磁盘空间

问题 3: 缺少依赖文件
--------------------
错误信息: Cannot find module '...'

解决方法:
1. 确保所有文件都在 dist 目录中
2. 重新打包程序
3. 检查 pkg 配置是否正确

问题 4: 原生模块错误
--------------------
错误信息: better-sqlite3 或 sqlite3 相关错误

解决方法:
1. 在打包环境中重新构建原生模块
2. 或使用预编译的二进制文件

问题 5: 防火墙阻止
------------------
现象: 程序启动但浏览器无法访问

解决方法:
1. 检查 Windows 防火墙设置
2. 允许 queue-system.exe 通过防火墙
3. 或临时关闭防火墙测试

四、获取详细错误信息
--------------------

方法 1: 使用批处理文件
在 dist 目录中运行 "运行诊断.bat"

方法 2: 在命令行中运行
1. 打开 CMD
2. cd 到 dist 目录
3. 运行: queue-system.exe
4. 查看完整错误输出

方法 3: 重定向输出到文件
queue-system.exe > error.log 2>&1
然后查看 error.log 文件

五、联系支持
------------
如果以上方法都无法解决问题，请提供以下信息：
1. 完整的错误信息（从命令行窗口复制）
2. 操作系统版本
3. Node.js 版本（如果知道）
4. 程序版本
5. 问题发生的具体步骤
`;
  fs.writeFileSync(troubleshootingPath, troubleshootingContent, 'utf8');
  
  console.log('✓ 已创建诊断工具和故障排除文档');
  
  console.log('✓ 外部资源目录创建完成\n');
} catch (error) {
  console.warn('⚠ 创建外部资源目录时出现问题:', error.message);
}

// 完成
console.log('========================================');
console.log('✓ 打包完成！');
console.log('========================================\n');

// 验证最终文件
const finalExePath = path.join(__dirname, '../dist', targetPlatform.includes('win') ? 'queue-system.exe' : 'queue-system');
if (fs.existsSync(finalExePath)) {
  const stats = fs.statSync(finalExePath);
  const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  console.log('✓ 可执行文件: ' + finalExePath);
  console.log(`  文件大小: ${fileSizeMB} MB`);
} else {
  console.error('❌ 警告: 可执行文件未找到');
  console.error('  预期位置: ' + finalExePath);
  console.error('  请检查打包过程是否有错误\n');
}

console.log('外部图片目录: dist/pic/');
console.log('数据库文件: 已包含在可执行文件中，首次运行时会自动复制到可执行文件同目录\n');
console.log('使用说明: 请查看 dist/使用说明.txt\n');
