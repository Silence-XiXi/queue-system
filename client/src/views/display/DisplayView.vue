<template>
  <div class="display-container">
    <div class="header">
      <h1>排队叫号系统</h1>
      <div class="time">{{ currentTime }}</div>
    </div>
    
    <div class="content">
      <div class="current-calls">
        <h2>当前叫号</h2>
        <div class="call-list">
          <div 
            v-for="(call, index) in currentCalls" 
            :key="index"
            :class="['call-item', call.isNew ? 'highlight' : '']"
          >
            <div class="ticket-number">{{ call.ticketNumber }}</div>
            <div class="counter-number">{{ call.counterNumber }}号窗口</div>
          </div>
        </div>
      </div>
      
      <div class="waiting-info">
        <h2>等待信息</h2>
        <div class="business-stats">
          <div v-for="stat in waitingStats" :key="stat.id" class="stat-item">
            <div class="business-name">{{ stat.name }}</div>
            <div class="waiting-count">等待: {{ stat.count }}人</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import socket, { playVoice } from '@/socket';
import { ticketService } from '@/api';

const currentTime = ref(new Date().toLocaleTimeString());
const currentCalls = ref([]);
const waitingStats = ref([]);

// 更新当前时间
setInterval(() => {
  currentTime.value = new Date().toLocaleTimeString();
}, 1000);

// 模拟数据
onMounted(async () => {
  try {
    // 获取当前等待情况
    const response = await ticketService.getCurrent();
    // 处理数据...
  } catch (error) {
    console.error('获取数据失败:', error);
  }
  
  // 监听叫号事件
  socket.on('ticket:called', (data) => {
    // 添加新叫号到列表
    const newCall = {
      ...data,
      isNew: true
    };
    
    currentCalls.value.unshift(newCall);
    if (currentCalls.value.length > 10) {
      currentCalls.value.pop();
    }
    
    // 3秒后移除高亮
    setTimeout(() => {
      const index = currentCalls.value.findIndex(call => 
        call.ticketNumber === data.ticketNumber && call.isNew);
      if (index !== -1) {
        currentCalls.value[index].isNew = false;
      }
    }, 3000);
    
    // 播放语音
    playVoice(`请${data.ticketNumber}号到${data.counterNumber}号窗口`);
  });
});
</script>

<style scoped>
.display-container {
  background-color: #f5f7fa;
  height: 100vh;
  padding: 20px;
  box-sizing: border-box;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.header h1 {
  font-size: 32px;
  color: #303133;
}

.time {
  font-size: 24px;
  color: #606266;
}

.content {
  display: flex;
  height: calc(100% - 80px);
}

.current-calls {
  flex: 2;
  background-color: white;
  border-radius: 4px;
  padding: 20px;
  margin-right: 20px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}

.waiting-info {
  flex: 1;
  background-color: white;
  border-radius: 4px;
  padding: 20px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}

.call-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.call-item {
  display: flex;
  justify-content: space-between;
  padding: 15px;
  border-radius: 4px;
  background-color: #f5f7fa;
  transition: background-color 0.3s;
}

.highlight {
  background-color: #fdf6ec;
  animation: flash 1s 3;
}

.ticket-number {
  font-size: 24px;
  font-weight: bold;
}

.counter-number {
  font-size: 20px;
}

.business-stats {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  padding: 10px;
  background-color: #f5f7fa;
  border-radius: 4px;
}

@keyframes flash {
  0%, 100% { background-color: #fdf6ec; }
  50% { background-color: #faecd8; }
}
</style>
