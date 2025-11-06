<template>
  <div class="counter-container">
    <!-- 顶部空间 -->
    <div class="spacer-top"></div>
    
    <!-- 中间主要内容区 -->
    <div class="main-section">
      <!-- 左侧业务类型和等待人数 -->
      <div class="business-section">
        <h2 class="section-title">業務類型</h2>
        <div class="business-cards">
          <div 
            v-for="type in businessTypes" 
            :key="type.id" 
            :class="['business-card', currentBusinessType && currentBusinessType.id === type.id ? 'selected' : '']"
            @click="selectBusinessType(type)"
          >
            <div class="business-info">
              <div class="business-type-name">{{ type.name }}</div>
              <div class="business-type-english">{{ getEnglishName(type.name) }}</div>
            </div>
            <div class="waiting-count">
              <div class="count-number">{{ getWaitingCount(type.id) }}</div>
              <div class="count-label">等待</div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 右侧当前服务信息和操作区 -->
      <div class="service-section">
        <div class="current-service" :class="{'has-ticket': !!currentTicket}">
          <h2 class="section-title">當前服務</h2>
          <div v-if="currentTicket" class="ticket-panel">
            <div class="ticket-number">{{ currentTicket.ticketNumber }}</div>
            <div class="ticket-business">{{ currentTicket.businessTypeName }}</div>
            <div class="ticket-time">取號時間: {{ formatTime(currentTicket.createdAt) }}</div>
            <div class="service-actions">
              <el-button @click="recall" type="warning" icon="el-icon-bell" class="action-button recall">
                重新呼叫
              </el-button>
              <el-button @click="endService" type="success" icon="el-icon-check" class="action-button end">
                結束服務
              </el-button>
            </div>
          </div>
          <div v-else class="no-ticket">
            <div class="empty-state">
              <i class="el-icon-s-order"></i>
              <p>無當前服務</p>
            </div>
          </div>
        </div>
        
        <div class="operations">
          <div class="next-section">
            <el-button 
              type="primary" 
              size="large"
              @click="callNext" 
              :disabled="!currentBusinessType"
              class="next-button"
            >
              Next
            </el-button>
          </div>
          
          <div class="manual-section">
            <h3>手動叫號</h3>
            <div class="manual-input-group">
              <el-input v-model="manualTicketNumber" placeholder="請輸入票號" />
              <el-button 
                type="primary" 
                @click="startManualCall" 
                :disabled="!manualTicketNumber"
              >
                叫號
              </el-button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { businessTypeService, counterService, ticketService } from '@/api';
import socket from '@/socket';

// 移除柜台号和状态相关
const status = ref('available'); // 默认为可用状态
const businessTypes = ref([]);
const waitingCounts = ref([]);
const currentBusinessType = ref(null);
const currentTicket = ref(null);
const manualTicketNumber = ref('');

// 移除状态文本映射

// 获取业务类型的英文名称
const getEnglishName = (name) => {
  // 查找业务类型对象
  const businessType = businessTypes.value.find(type => type.name === name);
  return businessType && businessType.english_name ? businessType.english_name : name;
};

// 获取等待人数
const getWaitingCount = () => {
  // 票号功能已移除，统一返回0
  return 0;
};

// 获取等待人数数据
const fetchWaitingCounts = async () => {
  // 票号功能已移除，waitingCounts置为空数组
  waitingCounts.value = [];
};

onMounted(async () => {
  try {
    // 获取业务类型
    const response = await businessTypeService.getAll();
    businessTypes.value = response.data;
    
    // 获取等待人数
    await fetchWaitingCounts();
    
    // 定期刷新等待人数（每10秒）
    setInterval(fetchWaitingCounts, 10000);
    
    // 获取窗口信息（实际应用中可能需要登录或其他方式获取）
    // 这里简化处理
  } catch (error) {
    console.error('初始化数据失败:', error);
  }
  
  // 监听票号更新事件，刷新等待人数
  socket.on('ticket:created', fetchWaitingCounts);
  socket.on('ticket:statusUpdated', fetchWaitingCounts);
});

const selectBusinessType = (type) => {
  currentBusinessType.value = type;
};

const callNext = async () => {
  if (!currentBusinessType.value) {
    alert('請先選擇業務類型');
    return;
  }
  
  try {
    // 票号功能已移除，显示提示
    alert('此功能已不可用');
  } catch (error) {
    console.error('叫号失败:', error);
  }
};

const recall = () => {
  if (!currentTicket.value) return;
  
  // 通过socket触发重新叫号
  socket.emit('ticket:recall', {
    ticketNumber: currentTicket.value.ticketNumber,
    counterNumber: 1 // 使用固定柜台号
  });
};

const startManualCall = async () => {
  if (!manualTicketNumber.value) return;
  
  try {
    // 票号功能已移除，显示提示
    alert('此功能已不可用');
    manualTicketNumber.value = '';
  } catch (error) {
    console.error('手动叫号失败:', error);
  }
};

const endService = async () => {
  if (!currentTicket.value) return;
  
  try {
    await counterService.endService(1); // 使用固定柜台号
    currentTicket.value = null;
    // 刷新等待人数
    fetchWaitingCounts();
  } catch (error) {
    console.error('结束服务失败:', error);
  }
};

const formatTime = (timestamp) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
};
</script>

<style scoped>
/* 全局样式 */
.counter-container {
  padding: 1vh 3vw 0.5vh;
  min-height: 99vh;
  background-color: #f5f7fa;
  font-family: 'Arial', sans-serif;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-title {
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 10px;
  color: #303133;
  border-left: 4px solid #409EFF;
  padding-left: 10px;
}

/* 顶部空间 */
.spacer-top {
  height: 5px;
}

/* 中间主要内容区 */
.main-section {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 25px;
  height: calc(95vh - 40px); /* 减去头部高度 */
  overflow: hidden;
}

/* 业务类型区域 */
.business-section {
  background-color: white;
  border-radius: 8px;
  padding: 15px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.business-cards {
  display: flex;
  flex-direction: column;
  gap: 15px;
  overflow-y: auto;
  padding-right: 10px;
}

.business-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px 20px;
  border-radius: 6px;
  border: 1px solid #EBEEF5;
  transition: all 0.3s;
  cursor: pointer;
}

.business-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.business-card.selected {
  border-color: #409EFF;
  background-color: #ecf5ff;
}

.business-info {
  flex: 1;
}

.business-type-name {
  font-size: 1.1rem;
  font-weight: bold;
  margin-bottom: 5px;
}

.business-type-english {
  font-size: 0.8rem;
  color: #909399;
}

.waiting-count {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background-color: #f56c6c;
  color: white;
  width: 60px;
  height: 60px;
  border-radius: 50%;
  font-weight: bold;
}

.count-number {
  font-size: 1.5rem;
}

.count-label {
  font-size: 0.7rem;
}

/* 服务区域 */
.service-section {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.current-service {
  background-color: white;
  border-radius: 8px;
  padding: 15px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.05);
  flex: 1;
  display: flex;
  flex-direction: column;
}

.ticket-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
}

.ticket-number {
  font-size: 3.5rem;
  font-weight: bold;
  color: #409EFF;
  margin-bottom: 10px;
}

.ticket-business {
  font-size: 1.2rem;
  font-weight: bold;
  margin-bottom: 15px;
}

.ticket-time {
  font-size: 0.9rem;
  color: #909399;
  margin-bottom: 20px;
}

.service-actions {
  display: flex;
  gap: 20px;
  margin-top: 20px;
  width: 100%;
  justify-content: center;
}

.action-button {
  padding: 12px 20px;
  font-size: 1rem;
  font-weight: 500;
  min-width: 140px;
}

.recall {
  position: relative;
  overflow: hidden;
}

.recall:after {
  content: '';
  position: absolute;
  top: -20px;
  left: -20px;
  right: -20px;
  bottom: -20px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  animation: ripple 1.5s infinite;
  opacity: 0;
}

@keyframes ripple {
  0% {
    transform: scale(0.5);
    opacity: 0;
  }
  25% {
    opacity: 0.3;
  }
  100% {
    transform: scale(1.2);
    opacity: 0;
  }
}

.no-ticket {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  color: #909399;
}

.empty-state i {
  font-size: 3rem;
  margin-bottom: 10px;
}

/* 操作区域 */
.operations {
  background-color: white;
  border-radius: 8px;
  padding: 15px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.05);
}

.next-section {
  display: flex;
  justify-content: center;
  margin-bottom: 15px;
}

.next-button {
  width: 80%;
  height: 50px;
  font-size: 1.2rem;
}

.manual-section h3 {
  font-size: 1.1rem;
  margin-bottom: 10px;
  text-align: center;
}

.manual-input-group {
  display: flex;
  gap: 10px;
}

/* 响应式布局 */
@media (max-width: 1200px) {
  .main-section {
    grid-template-columns: 1fr;
    height: auto;
    overflow: visible;
  }
  
  .counter-container {
    height: auto;
    min-height: 100vh;
    padding-bottom: 5px;
  }
  
  .ticket-number {
    font-size: 3rem;
  }
}

@media (max-width: 992px) {
  .service-actions {
    width: 100%;
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
  
  .action-button {
    width: 100%;
  }
  
  .next-button {
    width: 100%;
  }
}

@media (max-width: 768px) {
  .header-section {
    flex-direction: column;
    align-items: flex-start;
    gap: 15px;
  }
  
  .header-right {
    width: 100%;
  }
  
  .toggle-button {
    width: 100%;
  }
  
  .business-card {
    flex-direction: column;
    align-items: flex-start;
    padding: 15px;
  }
  
  .waiting-count {
    margin-top: 10px;
    width: 100%;
    height: 40px;
    border-radius: 4px;
    flex-direction: row;
    justify-content: center;
    gap: 10px;
  }
  
  .service-actions {
    grid-template-columns: 1fr;
    gap: 10px;
  }
  
  .manual-input-group {
    flex-direction: column;
  }
}

@media (max-width: 480px) {
  .counter-container {
    padding: 1vh 2vw;
  }
  
  .section-title {
    font-size: 1.2rem;
  }
  
  .business-type-name {
    font-size: 1rem;
  }
  
  .business-type-english {
    font-size: 0.7rem;
  }
  
  .ticket-number {
    font-size: 2.5rem;
  }
}
</style>