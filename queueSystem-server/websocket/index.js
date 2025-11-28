const { Server } = require('socket.io');
const { sequelize, counters: Counter } = require('../models');
const logger = require('../utils/logger');

let ioInstance = null;

function initSocketIO(server) {
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });
  
  ioInstance = io; // 保存io实例供外部使用
  
  io.on('connection', (socket) => {
    logger.info('客户端连接:', socket.id);
    
    // 窗口状态更新
    socket.on('counter:status', async (data) => {
      const { counterId, status } = data;
      try {
        // 使用Counter模型更新窗口状态
        const counter = await Counter.findByPk(counterId);
        if (counter) {
          await counter.update({ status });
          io.emit('counter:statusUpdated', { counterId, status });
        }
      } catch (error) {
        logger.error('更新窗口状态失败:', error);
      }
    });
    
    // 叫号事件
    socket.on('ticket:call', async (data) => {
      const { counterId, ticketId, ticketNumber, counterNumber, businessTypeName } = data;
      try {
        // 广播叫号事件
        io.emit('ticket:called', { 
          ticketNumber,
          counterNumber,
          businessTypeName
        });
      } catch (error) {
        logger.error('叫号失败:', error);
      }
    });
    
    // 重新叫号事件
    socket.on('ticket:recall', (data) => {
      const { ticketNumber, counterNumber } = data;
      io.emit('ticket:called', { ticketNumber, counterNumber });
    });
    
    // 语音播报事件
    socket.on('voice:announce', (data) => {
      const { ticketNumber, counterNumber, action } = data;
      // 广播给所有客户端，由客户端判断是否需要播放
      io.emit('voice:announce', {
        ticketNumber,
        counterNumber,
        action
      });
    });
    
    socket.on('disconnect', () => {
      logger.info('客户端断开连接:', socket.id);
    });
  });
  
  return io;
}

// 获取Socket.IO实例
function getIO() {
  return ioInstance;
}

module.exports = { initSocketIO, getIO };
