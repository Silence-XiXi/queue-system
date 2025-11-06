const { Server } = require('socket.io');
const { sequelize, counters: Counter } = require('../models');

function initSocketIO(server) {
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });
  
  io.on('connection', (socket) => {
    console.log('客户端连接:', socket.id);
    
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
        console.error('更新窗口状态失败:', error);
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
        console.error('叫号失败:', error);
      }
    });
    
    // 重新叫号事件
    socket.on('ticket:recall', (data) => {
      const { ticketNumber, counterNumber } = data;
      io.emit('ticket:called', { ticketNumber, counterNumber });
    });
    
    socket.on('disconnect', () => {
      console.log('客户端断开连接:', socket.id);
    });
  });
  
  return io;
}

module.exports = { initSocketIO };
