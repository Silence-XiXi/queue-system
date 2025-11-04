<template>
  <div class="counter-container">
    <div class="header">
      <div class="counter-info">
        <h2>窗口号: {{ counterNumber }}号</h2>
        <div :class="['status', status]">状态: {{ statusText }}</div>
      </div>
      <div class="counter-actions">
        <el-button @click="toggleStatus">{{ status === 'available' ? '暂停服务' : '开始服务' }}</el-button>
      </div>
    </div>
    
    <div class="business-types">
      <h3>请选择业务类型</h3>
      <div class="business-type-buttons">
        <el-button 
          v-for="type in businessTypes" 
          :key="type.id" 
          :type="currentBusinessType && currentBusinessType.id === type.id ? 'primary' : 'default'"
          @click="selectBusinessType(type)"
        >
          {{ type.name }}
        </el-button>
      </div>
    </div>
    
    <div class="current-service" v-if="currentTicket">
      <h3>当前服务</h3>
      <div class="ticket-info">
        <div class="ticket-number">{{ currentTicket.ticketNumber }}</div>
        <div class="ticket-business">{{ currentTicket.businessTypeName }}</div>
        <div class="ticket-time">取号时间: {{ formatTime(currentTicket.createdAt) }}</div>
      </div>
    </div>
    
    <div class="action-buttons">
      <el-button type="primary" @click="callNext" :disabled="!currentBusinessType || status !== 'available'">
        Next
      </el-button>
      <el-button @click="recall" :disabled="!currentTicket">
        Recall
      </el-button>
    </div>
    
    <div class="manual-call">
      <div class="input-group">
        <el-input v-model="manualTicketNumber" placeholder="请输入票号" />
        <el-button @click="startManualCall" :disabled="!manualTicketNumber || status !== 'available'">
          Start
        </el-button>
      </div>
    </div>
    
    <div class="end-service">
      <el-button type="success" @click="endService" :disabled="!currentTicket">
        End
      </el-button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { businessTypeService, counterService } from '@/api';
import socket from '@/socket';

const counterNumber = ref(1); // 默认窗口号，实际应从登录或配置获取
const status = ref('closed'); // closed, available, busy
const businessTypes = ref([]);
const currentBusinessType = ref(null);
const currentTicket = ref(null);
const manualTicketNumber = ref('');

const statusText = computed(() => {
  const statusMap = {
    'closed': '已关闭',
    'available': '空闲',
    'busy': '繁忙'
  };
  return statusMap[status.value] || '未知';
});

onMounted(async () => {
  try {
    // 获取业务类型
    const response = await businessTypeService.getAll();
    businessTypes.value = response.data;
    
    // 获取窗口信息（实际应用中可能需要登录或其他方式获取）
    // 这里简化处理
  } catch (error) {
    console.error('初始化数据失败:', error);
  }
  
  // 监听socket事件
  socket.on('counter:statusUpdated', (data) => {
    if (data.counterNumber === counterNumber.value) {
      status.value = data.status;
    }
  });
});

const toggleStatus = async () => {
  const newStatus = status.value === 'available' ? 'closed' : 'available';
  try {
    await counterService.update(counterNumber.value, { status: newStatus });
    status.value = newStatus;
  } catch (error) {
    console.error('更新状态失败:', error);
  }
};

const selectBusinessType = (type) => {
  currentBusinessType.value = type;
};

const callNext = async () => {
  if (!currentBusinessType.value) {
    alert('请先选择业务类型');
    return;
  }
  
  try {
    const response = await counterService.callNext(
      counterNumber.value, 
      currentBusinessType.value.id
    );
    
    if (response.data) {
      currentTicket.value = response.data;
      status.value = 'busy';
    } else {
      alert('当前没有等待的客户');
    }
  } catch (error) {
    console.error('叫号失败:', error);
  }
};

const recall = () => {
  if (!currentTicket.value) return;
  
  // 通过socket触发重新叫号
  socket.emit('ticket:recall', {
    ticketNumber: currentTicket.value.ticketNumber,
    counterNumber: counterNumber.value
  });
};

const startManualCall = async () => {
  if (!manualTicketNumber.value) return;
  
  try {
    const response = await counterService.callManual(
      counterNumber.value, 
      manualTicketNumber.value
    );
    
    if (response.data) {
      currentTicket.value = response.data;
      status.value = 'busy';
      manualTicketNumber.value = '';
    } else {
      alert('未找到此票号或票号已失效');
    }
  } catch (error) {
    console.error('手动叫号失败:', error);
  }
};

const endService = async () => {
  if (!currentTicket.value) return;
  
  try {
    await counterService.endService(counterNumber.value);
    currentTicket.value = null;
    status.value = 'available';
  } catch (error) {
    console.error('结束服务失败:', error);
  }
};

const formatTime = (timestamp) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleTimeString();
};
</script>

<style scoped>
.counter-container {
  padding: 20px;
  max-width: 800px;
  margin: 0 auto;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 10px;
  border-bottom: 1px solid #EBEEF5;
}

.counter-info h2 {
  margin: 0 0 10px 0;
}

.status {
  display: inline-block;
  padding: 5px 10px;
  border-radius: 4px;
  font-weight: bold;
}

.status.available {
  background-color: #f0f9eb;
  color: #67c23a;
}

.status.busy {
  background-color: #fdf6ec;
  color: #e6a23c;
}

.status.closed {
  background-color: #f4f4f5;
  color: #909399;
}

.business-types {
  margin-bottom: 20px;
}

.business-type-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 10px;
}

.current-service {
  margin-bottom: 20px;
  padding: 15px;
  background-color: #f5f7fa;
  border-radius: 4px;
}

.ticket-info {
  display: flex;
  align-items: center;
  gap: 20px;
}

.ticket-number {
  font-size: 24px;
  font-weight: bold;
}

.action-buttons {
  display: flex;
  gap: 15px;
  margin-bottom: 20px;
}

.manual-call {
  margin-bottom: 20px;
}

.input-group {
  display: flex;
  gap: 10px;
}

.end-service {
  display: flex;
  justify-content: center;
  margin-top: 30px;
}
</style>
