<template>
  <div class="ticket-container">
    <div class="content-wrapper">
      <div class="header">
        <h1>請選擇業務類型</h1>
        <h2>Please Select Service Type</h2>
      </div>
      
      <!-- <div class="date-time-display">
        <div class="current-date">{{ currentDateFormatted }}</div>
        <div class="current-time">{{ currentTimeFormatted }}</div>
      </div> -->
      
      <div class="business-type-grid">
        <div 
          v-for="type in businessTypesWithEnglish" 
          :key="type.id" 
          class="business-type-btn" 
          :class="{ 'selected': selectedType && selectedType.id === type.id }"
          @click="selectBusinessType(type)"
        >
          <div class="btn-icon">{{ type.code }}</div>
          <div class="btn-text">
            <div class="chinese-text">{{ type.name }}</div>
            <div class="english-text">{{ type.englishName }}</div>
          </div>
        </div>
      </div>

      <div class="get-ticket-section">
        <button 
          class="get-ticket-btn" 
          :class="{ 'disabled': !selectedType || ticketInfo }"
          @click="getTicket"
        >
          <div class="chinese-text">取號</div>
          <div class="english-text">Get Ticket</div>
        </button>
      </div>

      <div v-if="ticketInfo" class="ticket-info">
        <div class="ticket-number">{{ ticketInfo.ticket_number }}</div>
        <div class="ticket-message">
          <div class="chinese-text">您的號碼已取得</div>
          <div class="english-text">Your ticket has been issued</div>
        </div>
        <div class="waiting-info">
          <div class="chinese-text">前面等待: {{ waitingCount }} 位</div>
          <div class="english-text">Waiting: {{ waitingCount }}</div>
        </div>
      </div>
    </div>
  </div>

  <!-- 错误提示弹窗 -->
  <div v-if="showErrorDialog" class="custom-dialog-overlay" @click="closeErrorDialog">
    <div class="custom-dialog" @click.stop>
      <div class="dialog-icon">
        <div class="error-icon">!</div>
      </div>
      <div class="dialog-content">
        <div class="dialog-title">
          <div class="chinese-text">{{ errorType === 'noSelection' ? '提示' : '功能不可用' }}</div>
          <div class="english-text">{{ errorType === 'noSelection' ? 'Reminder' : 'Service Unavailable' }}</div>
        </div>
        <div class="dialog-message">
          <template v-if="errorType === 'noSelection'">
            <div class="chinese-text">請先選擇業務類型</div>
            <div class="english-text">Please select a service type first</div>
          </template>
          <template v-else-if="errorType === 'serviceRemoved'">
            <div class="chinese-text">此功能已不可用</div>
            <div class="english-text">This feature is no longer available</div>
          </template>
          <template v-else>
            <div class="chinese-text">取票失敗，請重試</div>
            <div class="english-text">Failed to get ticket, please try again</div>
          </template>
        </div>
      </div>
      <div class="dialog-footer">
        <button class="dialog-btn" @click="closeErrorDialog">
          <div class="chinese-text">確定</div>
          <div class="english-text">OK</div>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, onUnmounted } from 'vue';
import { businessTypeService, ticketService } from '@/api';

const businessTypes = ref([]);
const selectedType = ref(null);
const ticketInfo = ref(null);
const waitingCount = ref(0);
const currentDate = ref(new Date());
const timerInterval = ref(null);
const isLoading = ref(false);
const showErrorDialog = ref(false);
const errorType = ref('apiError'); // 'apiError' 或 'noSelection'

// 格式化日期：年月日 星期几(英文)
const currentDateFormatted = computed(() => {
  const date = currentDate.value;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const weekday = weekdays[date.getDay()];
  
  return `${year}-${month}-${day} ${weekday}`;
});

// 格式化时间：时分秒
const currentTimeFormatted = computed(() => {
  const date = currentDate.value;
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  
  return `${hours}:${minutes}:${seconds}`;
});

// 为业务类型准备英文翻译
const businessTypesWithEnglish = computed(() => {
  return businessTypes.value.map(type => ({
    ...type,
    englishName: type.english_name || ''
  }));
});

// 加载等待队列数量
const loadWaitingCount = async () => {
  // 票号功能已移除，直接返回0
  waitingCount.value = 0;
};

onMounted(async () => {
  try {
    const response = await businessTypeService.getAll();
    businessTypes.value = response.data;
  } catch (error) {
    console.error('获取业务类型失败:', error);
  }
  
  // 启动时间更新定时器，每秒更新一次
  timerInterval.value = setInterval(() => {
    currentDate.value = new Date();
  }, 1000);
});

// 组件卸载时清除定时器
onUnmounted(() => {
  if (timerInterval.value) {
    clearInterval(timerInterval.value);
  }
});

const selectBusinessType = (type) => {
  // 选择业务类型后的处理逻辑
  selectedType.value = type;
  ticketInfo.value = null; // 清除之前的票号信息
  console.log('选择了业务类型:', type);
};

// 取票逻辑
const getTicket = async () => {
  // 如果未选择业务类型，显示提示
  if (!selectedType.value) {
    showErrorDialog.value = true;
    errorType.value = 'noSelection';
    return;
  }
  
  // 如果已经有票号或正在加载中，不执行操作
  if (ticketInfo.value || isLoading.value) return;
  
  isLoading.value = true;
  try {
    // 票号功能已移除，显示功能不可用的错误消息
    console.error('票号功能已移除');
    showErrorDialog.value = true;
    errorType.value = 'serviceRemoved';
  } finally {
    isLoading.value = false;
  }
};

// 关闭错误弹窗
const closeErrorDialog = () => {
  showErrorDialog.value = false;
};
</script>

<style>
/* 基础样式设置，使用相对单位 */
:root {
  --base-font-size: 20px;  /* 增大基础字体大小 */
}
</style>

<style scoped>
/* 消除默认边距，防止滚动条出现 */
:root, body, html {
  margin: 0;
  padding: 0;
  overflow: hidden;
}

.ticket-container {
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh; /* 使用固定高度而非最小高度 */
  max-height: 100vh; /* 限制最大高度 */
  background-color: #f5f7fa;
  font-family: 'Arial', sans-serif;
  box-sizing: border-box;
  overflow: hidden; /* 防止内容溢出 */
}

/* 内容包装器，实现垂直居中 */
.content-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2vh 3vw;
  height: 100%; /* 使用100%高度填充容器 */
  width: 100%;
  box-sizing: border-box;
}

.header {
  text-align: center;
  margin-bottom: 2vh; /* 减小底部间距 */
  width: 100%;
}

.date-time-display {
  text-align: center;
  margin-bottom: 2vh; /* 减小底部间距 */
  padding: 1vh 0; /* 减小内部间距 */
  background-color: rgba(64, 158, 255, 0.1);
  border-radius: 8px;
  width: 80%;
  max-width: 600px;
}

.current-date {
  font-size: 20px;
  color: #606266;
  margin-bottom: 5px;
}

.current-time {
  font-size: 32px;
  font-weight: 700;
  color: #409EFF;
}

.header h1 {
  font-size: 36px; /* 调整为48px */
  color: #303133;
  margin-bottom: 0.3rem; /* 减小标题之间的间距 */
  margin-top: 0.2rem; /* 确保顶部有少量间距 */
  font-weight: 600; /* 增加字重 */
}

.header h2 {
  font-size: calc(var(--base-font-size) * 1);
  color: #606266;
  font-weight: normal;
  margin-bottom: 0.3rem; /* 减小与下方内容的间距 */
}

.business-type-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 2vw;
  width: 90%;
  max-width: 1200px;
  margin: 0; /* 移除所有边距 */
  padding: 0;
  max-height: calc(100vh - 120px); /* 确保不超出视口高度 */
  overflow-y: auto; /* 如果内容过多，允许滚动 */
}

.business-type-btn {
  display: flex;
  align-items: center;
  background-color: #ffffff;
  border-radius: 10px;
  padding: 2.5vh 2vw;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  cursor: pointer;
  transition: all 0.3s;
  border-left: 5px solid #409EFF;
  margin-bottom: 2vh;
}

.business-type-btn:hover {
  transform: translateY(-5px);
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
}

.btn-icon {
  font-size: calc(var(--base-font-size) * 1.8); /* 增大图标大小 */
  color: #409EFF;
  margin-right: 1vw;
  flex-shrink: 0;
}

.btn-text {
  flex: 1;
}

.chinese-text {
  /* 使用CSS变量，添加!important确保优先级 */
  font-size: calc(var(--base-font-size) * 1) !important; 
  color: #303133;
  font-weight: bold;
  margin-bottom: 0.7rem; /* 增加中英文间距 */
  line-height: 1.3; /* 改善行高 */
}

.english-text {
  /* 使用CSS变量，添加!important确保优先级 */
  font-size: calc(var(--base-font-size) * 1) !important; 
  color: #505050; /* 加深颜色提高可读性 */
  line-height: 1.2; /* 改善行高 */
}

/* 选中状态 */
.business-type-btn.selected {
  background-color: #e6f1fc;
  border-left: 5px solid #1989fa;
  transform: translateY(-3px);
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
}

/* Footer已移除 */

/* 响应式布局 - 大屏幕 */
@media (min-width: 1400px) {
  :root {
    --base-font-size: 24px;  /* 大屏幕上使用更大字体 */
  }
  
  .business-type-grid {
    max-width: 1400px;
  }
}

/* 响应式布局 - 平板电脑 */
@media (max-width: 1024px) {
  :root {
    --base-font-size: 18px;  /* 增大平板设备字体 */
  }
  
  .business-type-grid {
    width: 95%;
    gap: 15px;
  }
  
  .business-type-btn {
    padding: 20px 15px;
  }
}

/* 响应式布局 - 大型手机 */
@media (max-width: 768px) {
  :root {
    --base-font-size: 17px;  /* 增大手机上的字体 */
  }
  
  .business-type-grid {
    grid-template-columns: 1fr;
    width: 90%;
  }
  
  .header h1 {
    font-size: 28px; /* 调整为40px */
  }
  
  .header h2 {
    font-size: calc(var(--base-font-size) * 1.4);
  }
  
  .business-type-btn {
    padding: 15px;
  }
}

/* 取号按钮区域 */
.get-ticket-section {
  margin-top: 3vh;
  display: flex;
  justify-content: center;
  width: 100%;
}

.get-ticket-btn {
  background-color: #409EFF;
  color: white;
  border: none;
  border-radius: 10px;
  padding: 1.5vh 10vw; /* 减小垂直内边距从2vh到1.5vh */
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 4px 12px rgba(64, 158, 255, 0.4);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.get-ticket-btn:hover {
  background-color: #66b1ff;
  transform: translateY(-3px);
  box-shadow: 0 6px 15px rgba(64, 158, 255, 0.5);
}

.get-ticket-btn:active {
  transform: translateY(0);
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.5);
}

.get-ticket-btn.disabled {
  background-color: #a0cfff;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.get-ticket-btn.disabled:hover {
  background-color: #a0cfff;
  transform: none;
  box-shadow: none;
}

.get-ticket-btn .chinese-text {
  margin-bottom: 0.2rem; /* 减小底部边距 */
  font-size: calc(var(--base-font-size) * 1.3) !important; /* 减小字体大小 */
  color: white;
}

.get-ticket-btn .english-text {
  font-size: calc(var(--base-font-size) * 0.9) !important; /* 减小字体大小 */
  color: rgba(255, 255, 255, 0.9);
}

/* 票号信息显示 */
.ticket-info {
  margin-top: 4vh;
  background-color: #f0f9eb;
  border: 1px solid #e1f3d8;
  border-radius: 10px;
  padding: 3vh 3vw;
  text-align: center;
  width: 80%;
  max-width: 500px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}

.ticket-number {
  font-size: calc(var(--base-font-size) * 4);
  color: #67c23a;
  font-weight: bold;
  margin-bottom: 2vh;
}

.ticket-message {
  margin-bottom: 2vh;
}

.ticket-message .chinese-text {
  color: #67c23a;
}

.ticket-message .english-text {
  color: #85ce61;
}

.waiting-info {
  margin-top: 1vh;
  padding-top: 1vh;
  border-top: 1px dashed #c0e3b2;
}

/* 自定义弹窗样式 */
.custom-dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.custom-dialog {
  background-color: white;
  border-radius: 10px;
  width: 90%;
  max-width: 400px;
  padding: 20px;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.dialog-icon {
  margin-bottom: 15px;
}

.error-icon {
  width: 60px;
  height: 60px;
  background-color: #f56c6c;
  border-radius: 50%;
  display: flex;
  justify-content: center;
  align-items: center;
  color: white;
  font-size: 36px;
  font-weight: bold;
}

.dialog-content {
  width: 100%;
  text-align: center;
  margin-bottom: 20px;
}

.dialog-title {
  margin-bottom: 10px;
}

.dialog-title .chinese-text {
  font-size: calc(var(--base-font-size) * 1.2) !important;
  color: #303133;
  margin-bottom: 5px;
}

.dialog-title .english-text {
  font-size: calc(var(--base-font-size) * 1) !important;
  color: #606266;
}

.dialog-message .chinese-text {
  font-size: calc(var(--base-font-size) * 1.1) !important;
  margin-bottom: 5px;
}

.dialog-message .english-text {
  font-size: calc(var(--base-font-size) * 0.9) !important;
  color: #606266;
}

.dialog-footer {
  width: 100%;
  display: flex;
  justify-content: center;
  margin-top: 10px;
}

.dialog-btn {
  background-color: #409EFF;
  color: white;
  border: none;
  border-radius: 5px;
  padding: 10px 25px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  transition: all 0.3s;
}

.dialog-btn:hover {
  background-color: #66b1ff;
}

.dialog-btn .chinese-text {
  margin-bottom: 3px;
  color: white;
}

.dialog-btn .english-text {
  font-size: calc(var(--base-font-size) * 0.8) !important;
  color: rgba(255, 255, 255, 0.9);
}

/* 响应式布局 - 小型手机 */
@media (max-width: 480px) {
  :root {
    --base-font-size: 14px;  /* 增大小屏幕手机字体 */
  }
  
  .header {
    margin-bottom: 2vh;
  }
  
  .header h1 {
    font-size: 18px; /* 调整为32px */
  }
  
  .header h2 {
    font-size: calc(var(--base-font-size) * 1.4);
  }
  
  .business-type-grid {
    width: 95%;
    gap: 10px;
  }
  
  .business-type-btn {
    padding: 12px 10px;
  }
  
  .btn-icon {
    font-size: calc(var(--base-font-size) * 1.5);
    margin-right: 8px;
  }
  
  .ticket-number {
    font-size: calc(var(--base-font-size) * 3);
  }
  
  .custom-dialog {
    width: 95%;
    padding: 15px;
  }
  
  .error-icon {
    width: 50px;
    height: 50px;
    font-size: 30px;
  }
}
</style>
