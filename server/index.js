const app = require('./app');
const http = require('http');
const { initSocketIO } = require('./websocket');
const { sequelize } = require('./models');
const { seedDatabase } = require('./utils/seeder');

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);

// 初始化WebSocket
initSocketIO(server);

// 初始化数据库
async function initDatabase() {
  try {
    // 同步数据库模型
    await sequelize.sync();
    
    // 如果是开发环境，填充初始数据
    if (process.env.NODE_ENV !== 'production') {
      await seedDatabase();
    }
    
    console.log('数据库初始化成功');
  } catch (error) {
    console.error('数据库初始化失败:', error);
  }
}

// 启动服务器
async function startServer() {
  await initDatabase();
  
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`服务器运行在 http://0.0.0.0:${PORT}`);
  });
}

startServer();
