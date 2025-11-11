const app = require('./app');
const http = require('http');
const { initSocketIO } = require('./websocket');
const { sequelize } = require('./models');
const { seedDatabase } = require('./utils/seeder');
const { initAdminSettings } = require('./utils/initAdminSettings');
const createTicketSequencesTable = require('./utils/createTicketSequencesTable');
const dailyResetScheduler = require('./utils/dailyResetScheduler');

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
    await sequelize.sync({ alter: false });
    
    // 如果是开发环境，填充初始数据
    if (process.env.NODE_ENV !== 'production') {
      await seedDatabase();
    }
    
    // 初始化管理员设置
    await initAdminSettings();
    
    // 创建ticket_sequences表
    await createTicketSequencesTable();
    
    console.log('数据库初始化成功');
  } catch (error) {
    console.error('数据库初始化失败:', error);
  }
}

// 启动服务器
async function startServer() {
  await initDatabase();
  
  // 启动每日重置定时任务
  try {
    await dailyResetScheduler.start();
    // 输出定时任务状态
    const status = dailyResetScheduler.getStatus();
    console.log('定时任务状态:', JSON.stringify(status, null, 2));
  } catch (error) {
    console.error('启动定时任务失败:', error);
    console.error('错误堆栈:', error.stack);
  }
  
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`服务器运行在 http://0.0.0.0:${PORT}`);
  });
}

startServer();
