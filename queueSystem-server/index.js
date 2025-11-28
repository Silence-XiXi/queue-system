// 设置控制台编码（解决 Windows 繁体中文系统乱码问题）
// 控制台输出使用简体中文，设置为 GBK 编码（代码页936）
if (process.platform === 'win32') {
  try {
    const { execSync } = require('child_process');
    // 设置控制台代码页为 GBK (936) - 适用于简体中文
    try {
      execSync('chcp 936 >nul 2>&1', { stdio: 'ignore' });
    } catch (e) {
      // 如果设置失败，忽略错误（可能没有管理员权限）
    }
    // 设置 stdout/stderr 编码
    process.stdout.setDefaultEncoding('gbk');
    process.stderr.setDefaultEncoding('gbk');
  } catch (error) {
    // 忽略编码设置错误
  }
}

const app = require('./app');
const http = require('http');
const os = require('os');
const { initSocketIO } = require('./websocket');
const { sequelize } = require('./models');
const { seedDatabase } = require('./utils/seeder');
const { initAdminSettings } = require('./utils/initAdminSettings');
const dailyResetScheduler = require('./utils/dailyResetScheduler');
const { addDatabaseIndexes } = require('./utils/addDatabaseIndexes');
const printerService = require('./services/printerService');
const logger = require('./utils/logger');

const PORT = process.env.PORT || 3000; // 修改为3001或其他未被占用的端口
const server = http.createServer(app);

// 初始化WebSocket
initSocketIO(server);

// 初始化数据库
async function initDatabase() {
  try {
    // 同步数据库模型 (force: true 会强制更新表结构，但会清空数据，谨慎使用)
    // await sequelize.sync({ force: true });
    
    // 使用 alter: true 可以安全地更新表结构而不删除数据
    // 注意：在生产环境中，建议使用 alter: false 并手动管理数据库迁移
    await sequelize.sync({ alter: process.env.NODE_ENV === 'development' });
    
    // 添加性能优化所需的数据库索引
    // 注意：索引添加失败不会影响程序运行，只是查询性能可能稍慢
    try {
      await addDatabaseIndexes();
    } catch (error) {
      // 索引添加失败不影响程序启动，只记录警告
      logger.warn('数据库索引添加失败（不影响程序运行）:', error.message);
    }
    
    // 如果是开发环境，填充初始数据
    if (process.env.NODE_ENV !== 'production') {
      await seedDatabase();
    }
    
    // 初始化管理员设置
    await initAdminSettings();
    
    logger.info('数据库初始化成功');
  } catch (error) {
    logger.error('数据库初始化失败:', error);
  }
}

// 启动服务器
async function startServer() {
  try {
    await initDatabase();
    
    // 启动每日重置定时任务
    try {
      await dailyResetScheduler.start();
      // 输出定时任务状态
      const status = dailyResetScheduler.getStatus();
      logger.info('定时任务状态:', JSON.stringify(status, null, 2));
    } catch (error) {
      logger.error('启动定时任务失败:', error);
      // 定时任务失败不影响服务器启动，继续执行
    }
    
    // 初始化打印机
    try {
      if (printerService.isAvailable()) {
        const initResult = await printerService.initPrinter();
        if (initResult) {
          logger.info('✅ 打印机初始化成功', null, true);
        } else {
          logger.warn('⚠️  打印机初始化失败，但服务器将继续运行', null, true);
        }
      } else {
        logger.info('ℹ️  打印机功能未启用（DLL未加载或已禁用）', null, true);
      }
    } catch (error) {
      logger.error('初始化打印机时发生错误:', error);
      // 打印机初始化失败不影响服务器启动，继续执行
    }
    
    server.listen(PORT, '0.0.0.0', () => {
      // 获取所有网络接口的IP地址
      const networkInterfaces = os.networkInterfaces();
      const addresses = [];
      
      Object.keys(networkInterfaces).forEach((interfaceName) => {
        networkInterfaces[interfaceName].forEach((iface) => {
          // 只显示 IPv4 地址，排除内部地址
          if (iface.family === 'IPv4' && !iface.internal) {
            addresses.push(iface.address);
          }
        });
      });
      
      // 使用第一个可用的 IP 地址，如果没有则使用 localhost
      const primaryIP = addresses.length > 0 ? addresses[0] : 'localhost';
      
      // 构建启动信息
      let startupInfo = '\n========================================\n';
      startupInfo += '服务器启动成功！\n';
      startupInfo += '========================================\n';
      startupInfo += `本地访问地址:\n`;
      startupInfo += `  http://localhost:${PORT}\n`;
      startupInfo += `  http://127.0.0.1:${PORT}\n`;
      startupInfo += `\n网络访问地址:\n`;
      
      if (addresses.length > 0) {
        addresses.forEach((ip) => {
          startupInfo += `  http://${ip}:${PORT}\n`;
        });
      } else {
        startupInfo += `  (未检测到网络接口，请检查网络配置)\n`;
      }
      
      startupInfo += `\n常用页面:\n`;
      startupInfo += `  取票页面: http://${primaryIP}:${PORT}/ticket\n`;
      startupInfo += `  显示屏: http://${primaryIP}:${PORT}/display\n`;
      startupInfo += `  叫号机: http://${primaryIP}:${PORT}/counter\n`;
      startupInfo += `  管理员: http://${primaryIP}:${PORT}/admin\n`;
      startupInfo += `\n提示: 从其他设备访问时，请使用网络访问地址（包含端口号）\n`;
      if (addresses.length > 0) {
        startupInfo += `例如: http://${addresses[0]}:${PORT}/display\n`;
      } else {
        startupInfo += `(未检测到网络接口，请检查网络配置)\n`;
      }
      startupInfo += '========================================\n';
      startupInfo += '按 Ctrl+C 停止服务器\n';
      
      // 输出到控制台（启动信息）和日志文件
      console.log(startupInfo);
      logger.info('服务器启动成功', {
        port: PORT,
        localAddresses: [`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`],
        networkAddresses: addresses.map(ip => `http://${ip}:${PORT}`),
        primaryIP,
        pages: {
          ticket: `http://${primaryIP}:${PORT}/ticket`,
          display: `http://${primaryIP}:${PORT}/display`,
          counter: `http://${primaryIP}:${PORT}/counter`,
          admin: `http://${primaryIP}:${PORT}/admin`
        }
      });
    });
    
    // 处理服务器监听错误
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        const errorMsg = `❌ 错误: 端口 ${PORT} 已被占用\n   解决方法:\n   1. 关闭占用端口 ${PORT} 的程序\n   2. 或使用环境变量设置其他端口: set PORT=8080`;
        console.error(errorMsg);
        logger.error(`端口 ${PORT} 已被占用`, error);
      } else {
        console.error('❌ 服务器启动失败:', error);
        logger.error('服务器启动失败:', error);
      }
      process.exit(1);
    });
    
  } catch (error) {
    console.error('❌ 启动服务器时发生严重错误:');
    console.error('错误信息:', error.message);
    logger.error('启动服务器时发生严重错误:', error);
    process.exit(1);
  }
}

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
  console.error('❌ 未捕获的异常:');
  console.error('错误信息:', error.message);
  logger.error('未捕获的异常:', error);
  // 不要立即退出，给用户时间看到错误信息
  setTimeout(() => {
    process.exit(1);
  }, 5000);
});

// 处理未处理的 Promise 拒绝
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ 未处理的 Promise 拒绝:');
  console.error('原因:', reason);
  logger.error('未处理的 Promise 拒绝:', reason instanceof Error ? reason : { reason });
  // 不要立即退出，给用户时间看到错误信息
  setTimeout(() => {
    process.exit(1);
  }, 5000);
});

// 启动服务器
startServer().catch((error) => {
  console.error('❌ 启动服务器失败:');
  console.error('错误信息:', error.message);
  logger.error('启动服务器失败:', error);
  process.exit(1);
});
