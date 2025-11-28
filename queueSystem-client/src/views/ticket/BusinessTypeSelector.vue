<template>
  <div class="business-types-view">
    <div class="header">
      <!-- 返回按钮移到header中 -->
      <button class="back-btn" @click="goBack">
        <div class="chinese-text">返回</div>
        <div class="english-text">Back</div>
      </button>
      
      <div class="header-content">
        <h1>請選擇業務類型</h1>
        <h2>Please Select Service Type</h2>
      </div>
    </div>
    
    <div class="business-type-grid">
      <div 
        v-for="type in businessTypes" 
        :key="type.id" 
        class="business-type-btn" 
        :class="{ 'selected': selectedType && selectedType.id === type.id }"
        @click="selectBusinessType(type)"
      >
        <div class="btn-content">
          <div class="btn-code">{{ type.code }}</div>
          <div class="btn-text-container">
            <div class="btn-chinese-text">{{ type.name }}</div>
            <div class="btn-english-text">{{ type.englishName }}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="get-ticket-section">
      <button 
        class="get-ticket-btn" 
        :class="{ 'disabled': !selectedType || ticketInfo }"
        @click="getTicket"
      >
        <div class="chinese-text">取票</div>
        <div class="english-text">Get Ticket</div>
      </button>
    </div>

    <!-- 取票成功弹窗 -->
    <div v-if="ticketInfo && showTicketDialog" class="ticket-dialog-overlay">
      <div class="ticket-dialog">
        <div class="ticket-dialog-content">
          <div class="ticket-header">
            <div class="chinese-text">您已成功獲取【{{ selectedType.name }}】服務號碼</div>
            <div class="english-text">You have successfully obtained a 【{{ selectedType.englishName }}】 service number</div>
          </div>
          <div class="ticket-number-section">
            <div class="ticket-label">
              <div class="chinese-text">您的號碼</div>
              <div class="english-text">Your Number</div>
            </div>
            <div class="ticket-number">{{ ticketInfo.ticket_number }}</div>
          </div>
          <div class="waiting-info">
            <div class="waiting-label">
              <div class="chinese-text">前面等待人數</div>
              <div class="english-text">People Waiting</div>
            </div>
            <div class="waiting-count">{{ waitingCount }}</div>
          </div>
          <!-- 打印状态提示 -->
          <div v-if="ticketInfo.print_status === 'error'" class="print-warning">
            <div class="warning-icon">⚠</div>
            <div class="warning-message">
              <div class="chinese-text">{{ ticketInfo.print_message || '打印機異常，請檢查打印機狀態' }}</div>
              <div class="english-text">Printer error, please check printer status</div>
            </div>
          </div>
        </div>
        <div class="ticket-dialog-footer">
          <button class="dialog-btn" @click="closeTicketDialog">
            <div class="chinese-text">確定</div>
            <div class="english-text">OK</div>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { defineProps, defineEmits, ref, computed } from 'vue';

const props = defineProps({
  businessTypes: {
    type: Array,
    required: true
  }
});

const emit = defineEmits(['back', 'getTicket']);

const selectedType = ref(null);
const ticketInfo = ref(null);
const waitingCount = ref(0);
const showTicketDialog = ref(false);

// 选择业务类型
const selectBusinessType = (type) => {
  selectedType.value = type;
  ticketInfo.value = null; // 清除之前的票号信息
};

// 返回首页
const goBack = () => {
  emit('back');
};

// 取票
const getTicket = () => {
  if (!selectedType.value) return;
  
  // 向父组件发送取票请求
  emit('getTicket', selectedType.value);
};

// 设置票号信息
const setTicketInfo = (info) => {
  ticketInfo.value = info;
  showTicketDialog.value = true; // 显示票号弹窗
};

// 设置等待人数
const setWaitingCount = (count) => {
  waitingCount.value = count;
};

// 关闭票号弹窗并返回首页
const closeTicketDialog = () => {
  showTicketDialog.value = false;
  // 返回首页
  emit('back');
};

// 暴露方法给父组件调用
defineExpose({
  setTicketInfo,
  setWaitingCount
});
</script>

<style>
/* 基础样式设置，使用相对单位 */
:root {
  --base-font-size: 35px;  /* 调整为24寸显示器合适尺寸（原20px * 1.75） */
}

/* 大屏幕（24寸显示器） */
@media (min-width: 1400px) {
  :root {
    --base-font-size: 42px;  /* 大屏幕上使用更大字体（原24px * 1.75） */
  }
}
</style>

<style scoped>
/* 业务类型选择页面样式 */
.business-types-view {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start; /* 改为顶部对齐，以便底部按钮可以固定 */
  width: 100%;
  height: 100%;
  padding: 210px 2.6vw 1.75vh; /* 增加顶部内边距以适应增加的header高度，确保不被遮挡 */
  box-sizing: border-box;
  overflow-y: auto; /* 将滚动设置在整个页面 */
  position: relative;
  padding-bottom: 180px; /* 为底部取票按钮留出空间（原85px * 1.75） */
}

.header {
  display: flex;
  width: 100%;
  position: fixed; /* 固定定位，不随滚动而移动 */
  top: 0;
  left: 0;
  right: 0;
  align-items: center;
  justify-content: center;
  min-height: 160px !important; /* 进一步增加header高度 */
  padding: 20px 0 !important; /* 大幅增加上下内边距 */
  background-color: #fff; /* 添加背景色 */
  z-index: 100; /* 确保在最上层 */
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.05); /* 增加阴影效果 */
}

.header-content {
  text-align: center;
  width: calc(100% - 160px); /* 为返回按钮留出空间，适应增加的header高度 */
  margin-left: auto;
  margin-right: auto;
  padding: 0; /* 移除内容区域的上下内边距，只保留header的padding */
}

.header h1 {
  font-size: calc(var(--base-font-size) * 1.5); /* 增大标题字体 */
  color: #303133;
  margin-bottom: 11px; /* 保持原来的中英文间距 */
  margin-top: 0; /* 移除顶部边距 */
  font-weight: 600;
  line-height: 1.3; /* 保持原来的行高 */
  padding: 0; /* 移除文字上下内边距 */
}

.header h2 {
  font-size: calc(var(--base-font-size) * 0.9); /* 增大副标题字体 */
  color: #606266;
  font-weight: normal;
  margin-bottom: 0; /* 移除底部边距 */
  margin-top: 0; /* 添加顶部边距 */
  line-height: 1.2; /* 保持原来的行高 */
  padding: 0; /* 移除文字上下内边距 */
}

.business-type-grid {
  display: grid;
  grid-template-columns: 1fr !important; /* 强制单列显示，每个业务类型占一行 */
  gap: 1.4vw; /* 增加间距（原0.8vw * 1.75） */
  width: 95% !important; /* 增加宽度比例，充分利用空间 */
  max-width: 1400px; /* 增加最大宽度（原800px * 1.75） */
  margin: 0 auto; /* 居中显示 */
  padding: 9px 0 0 0; /* 增加顶部内边距（原5px * 1.75） */
  /* 移除max-height和overflow-y，让整个页面滚动 */
  flex: 1; /* 让网格占据主要空间 */
  /* 移除padding-bottom，已在业务类型视图中添加 */
}

.business-type-btn {
  display: flex !important;
  flex-direction: row !important; /* 强制横向布局，适应单行显示 */
  align-items: center;
  justify-content: flex-start; /* 左对齐 */
  background-color: #ffffff;
  border-radius: 14px; /* 增加圆角（原8px * 1.75） */
  padding: 2vh 3vw !important; /* 增加垂直内边距 */
  box-shadow: 0 4px 14px 0 rgba(0, 0, 0, 0.1); /* 增加阴影 */
  cursor: pointer;
  transition: all 0.3s;
  border-left: 10px solid #409EFF !important; /* 增加左边框宽度 */
  border-top: none !important; /* 强制移除顶部边框 */
  margin-bottom: 1vh; /* 增加底部边距 */
  width: 100% !important; /* 强制占满整行 */
  min-height: 180px !important; /* 进一步增加最小高度 */
  max-height: 240px !important; /* 增加最大高度 */
  overflow: hidden; /* 防止内容溢出 */
  box-sizing: border-box !important; /* 确保padding和border包含在宽度内 */
}

.business-type-btn:hover {
  transform: translateY(-3px); /* 减小悬浮效果 */
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.btn-content {
  display: flex;
  flex-direction: row; /* 改为横向布局 */
  align-items: center;
  justify-content: flex-start; /* 左对齐 */
  width: 100%;
  height: 100%;
  gap: 1.5vw; /* 减少元素间距，避免溢出 */
  min-width: 0; /* 允许内容收缩 */
  overflow: hidden; /* 防止内容溢出 */
}

/* 文本容器，用于垂直排列中英文 */
.btn-text-container {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  flex: 1;
  min-width: 0; /* 允许文本收缩 */
  max-width: 100%; /* 限制最大宽度 */
  overflow: hidden; /* 防止内容溢出 */
}

.btn-code {
  font-size: clamp(70px, 8vw, 90px) !important; /* 大幅增大代码字体 */
  color: #409EFF;
  font-weight: bold;
  margin: 0; /* 移除边距，使用gap控制间距 */
  line-height: 1;
  min-width: 100px !important; /* 减少最小宽度，避免占用过多空间 */
  max-width: 120px !important; /* 限制最大宽度 */
  text-align: center; /* 代码居中显示 */
  flex-shrink: 0; /* 代码区域不收缩 */
}

.chinese-text {
  font-size: calc(var(--base-font-size) * 1) !important;
  color: #303133;
  font-weight: bold;
  margin-bottom: 0.5rem; /* 调整中英文间距 */
  line-height: 1.3;
}

.english-text {
  font-size: calc(var(--base-font-size) * 0.9) !important;
  color: #505050;
  line-height: 1.2;
}

/* 按钮内的中文文本 */
.btn-chinese-text {
  font-size: clamp(42px, 7vw, 55px) !important; /* 大幅增大中文字体 */
  color: #303133;
  font-weight: bold;
  margin: 0; /* 移除边距 */
  margin-bottom: 0.5rem; /* 增加中英文之间的间距 */
  line-height: 1.2; /* 适当增加行高 */
  text-align: left; /* 改为左对齐 */
  width: 100%;
  max-width: 100%; /* 限制最大宽度 */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap; /* 单行显示，不换行 */
  box-sizing: border-box; /* 确保宽度计算正确 */
}

/* 按钮内的英文文本 */
.btn-english-text {
  font-size: clamp(38px, 5.5vw, 48px) !important; /* 大幅增大英文字体 */
  color: #606266;
  line-height: 1.2; /* 适当增加行高 */
  text-align: left; /* 改为左对齐 */
  width: 100%;
  max-width: 100%; /* 限制最大宽度 */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap; /* 单行显示，不换行 */
  box-sizing: border-box; /* 确保宽度计算正确 */
}

/* 选中状态 */
.business-type-btn.selected {
  background-color: #e6f1fc;
  border-left: 7px solid #1989fa; /* 改为左边框，适应横向布局 */
  border-top: none; /* 移除顶部边框 */
  transform: translateY(-5px); /* 增加位移（原-3px * 1.75） */
  box-shadow: 0 7px 21px rgba(0, 0, 0, 0.1); /* 增加阴影 */
}

/* 取票按钮区域 */
.get-ticket-section {
  margin-top: 0;
  display: flex;
  justify-content: center;
  align-items: center; /* 垂直居中 */
  width: 100%;
  position: fixed; /* 固定在底部 */
  bottom: 0;
  left: 0;
  right: 0;
  padding: 1.05vh 0; /* 增加上下内边距（原0.6vh * 1.75） */
  background-color: rgba(255, 255, 255, 0.95); /* 半透明背景 */
  z-index: 99;
  box-shadow: 0 -2px 9px rgba(0, 0, 0, 0.14); /* 增加阴影 */
  height: 150px; /* 增加高度（原70px * 1.75） */
  border-top: 2px solid rgba(0, 0, 0, 0.05); /* 增加边框宽度 */
}

.get-ticket-btn {
  background-color: #67c23a; /* 使用绿色表示取票 */
  color: white;
  border: none;
  border-radius: 18px; /* 增加圆角（原10px * 1.75） */
  padding: 1.4vh 14vw; /* 增加内边距（原0.8vh 8vw * 1.75） */
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 4px 11px rgba(103, 194, 58, 0.4); /* 增加阴影 */
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin: 0; /* 移除上下边距 */
  height: 140px; /* 增加固定高度（原56px * 1.75） */
  min-width: 200px; /* 增加最小宽度 */
}

.get-ticket-btn:hover {
  background-color: #85ce61;
  transform: translateY(-3px);
  box-shadow: 0 6px 15px rgba(103, 194, 58, 0.5);
}

.get-ticket-btn:active {
  transform: translateY(0);
  box-shadow: 0 2px 8px rgba(103, 194, 58, 0.5);
}

.get-ticket-btn.disabled {
  background-color: #b3e19d;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.get-ticket-btn.disabled:hover {
  background-color: #b3e19d;
  transform: none;
  box-shadow: none;
}

.get-ticket-btn .chinese-text {
  margin-bottom: 2px; /* 增加底部间距 */
  font-size: calc(var(--base-font-size) * 1.5) !important; /* 增大字体 */
  color: white;
  line-height: 1.2;
}

.get-ticket-btn .english-text {
  font-size: calc(var(--base-font-size) * 1) !important; /* 增大字体 */
  color: rgba(255, 255, 255, 0.9);
  line-height: 1;
}

/* 返回按钮样式 - 左上角小按钮 */
.back-btn {
  position: absolute;
  left: 18px; /* 增加左边距（原10px * 1.75） */
  top: 50%;
  transform: translateY(-50%); /* 垂直居中 */
  background-color: rgba(144, 147, 153, 0.7);
  color: white;
  border: none;
  border-radius: 7px; /* 增加圆角（原4px * 1.75） */
  padding: 1.75vh 1.75vw; /* 增加内边距（原1vh 1vw * 1.75） */
  max-width: 140px; /* 增加最大宽度（原80px * 1.75） */
  width: auto;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.26); /* 增加阴影 */
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 101; /* 确保按钮在最上层 */
  min-height: 60px; /* 增加最小高度 */
}

.back-btn:hover {
  background-color: rgba(144, 147, 153, 0.9);
}

.back-btn:active {
  transform: translateY(1px);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
}

.back-btn .chinese-text {
  margin-bottom: 0;
  font-size: calc(var(--base-font-size) * 0.8) !important; /* 更小字体 */
  color: white;
  font-weight: normal;
  line-height: 1.1;
}

.back-btn .english-text {
  font-size: calc(var(--base-font-size) * 0.7) !important; /* 更小字体 */
  color: rgba(255, 255, 255, 0.9);
  line-height: 1;
}

/* 票号弹窗 */
.ticket-dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.ticket-dialog {
  background-color: white;
  border-radius: 21px; /* 增加圆角（原12px * 1.75） */
  width: 90%;
  max-width: 875px; /* 增加最大宽度（原500px * 1.75） */
  padding: 35px; /* 增加内边距（原20px * 1.75） */
  box-shadow: 0 9px 35px rgba(0, 0, 0, 0.3); /* 增加阴影 */
  display: flex;
  flex-direction: column;
  align-items: center;
  box-sizing: border-box; /* 确保padding不会增加宽度 */
  overflow: hidden; /* 防止内容溢出 */
}

.ticket-dialog-content {
  width: 100%;
  background-color: #f0f9eb;
  border: 2px solid #e1f3d8; /* 增加边框宽度（原1px * 1.75） */
  border-radius: 18px; /* 增加圆角（原10px * 1.75） */
  padding: 26px; /* 增加内边距（原15px * 1.75） */
  text-align: center;
  margin-bottom: 35px; /* 增加间距（原20px * 1.75） */
  box-sizing: border-box; /* 确保padding不会增加宽度 */
  overflow: hidden; /* 防止内容溢出 */
}

.ticket-header {
  margin-bottom: 21px; /* 增加间距（原12px * 1.75） */
  padding-bottom: 18px; /* 增加内边距（原10px * 1.75） */
  border-bottom: 2px dashed #c0e3b2; /* 增加边框宽度（原1px * 1.75） */
  width: 100%;
}

.ticket-header .chinese-text {
  font-size: clamp(16px, calc(var(--base-font-size) * 1.1), 22px); /* 使用clamp限制字体大小范围 */
  color: #67c23a;
  font-weight: bold;
  margin-bottom: 3px;
  word-break: break-word; /* 允许长词换行 */
}

.ticket-header .english-text {
  font-size: clamp(14px, calc(var(--base-font-size) * 0.85), 18px); /* 使用clamp限制字体大小范围 */
  color: #85ce61;
  word-break: break-word; /* 允许长词换行 */
}

.ticket-number-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 26px; /* 增加间距（原15px * 1.75） */
  width: 100%;
}

.ticket-label {
  margin-bottom: 14px; /* 增加间距（原8px * 1.75） */
}

.ticket-label .chinese-text {
  font-size: clamp(15px, calc(var(--base-font-size) * 1), 20px);
  color: #303133;
  margin-bottom: 2px;
}

.ticket-label .english-text {
  font-size: clamp(13px, calc(var(--base-font-size) * 0.75), 16px);
  color: #606266;
}

.ticket-number {
  font-size: clamp(63px, calc(var(--base-font-size) * 3.5), 123px); /* 增加字体大小（原36px, 70px * 1.75） */
  color: #67c23a;
  font-weight: bold;
  margin: 14px 0; /* 增加间距（原8px * 1.75） */
}

.waiting-info {
  margin-top: 18px; /* 增加间距（原10px * 1.75） */
  padding-top: 18px; /* 增加内边距（原10px * 1.75） */
  border-top: 2px dashed #c0e3b2; /* 增加边框宽度（原1px * 1.75） */
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
}

.waiting-label {
  margin-bottom: 14px; /* 增加间距（原8px * 1.75） */
}

.waiting-label .chinese-text {
  font-size: clamp(15px, calc(var(--base-font-size) * 1), 20px);
  color: #303133;
  margin-bottom: 2px;
}

.waiting-label .english-text {
  font-size: clamp(13px, calc(var(--base-font-size) * 0.75), 16px);
  color: #606266;
}

.waiting-count {
  font-size: clamp(49px, calc(var(--base-font-size) * 2.2), 88px); /* 增加字体大小（原28px, 50px * 1.75） */
  color: #e6a23c;
  font-weight: bold;
}

/* 打印警告提示 */
.print-warning {
  margin-top: 18px; /* 增加间距（原10px * 1.75） */
  padding: 14px 18px; /* 增加内边距（原8px 10px * 1.75） */
  background-color: #fef0f0;
  border: 2px solid #fbc4c4; /* 增加边框宽度（原1px * 1.75） */
  border-radius: 11px; /* 增加圆角（原6px * 1.75） */
  display: flex;
  align-items: flex-start;
  width: 100%;
  box-sizing: border-box;
}

.warning-icon {
  font-size: clamp(28px, calc(var(--base-font-size) * 1.2), 35px);
  color: #f56c6c;
  margin-right: 14px; /* 增加右边距（原8px * 1.75） */
  flex-shrink: 0;
}

.warning-message {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.warning-message .chinese-text {
  font-size: clamp(15px, calc(var(--base-font-size) * 0.9), 18px);
  color: #f56c6c;
  margin-bottom: 4px;
  line-height: 1.4;
}

.warning-message .english-text {
  font-size: clamp(13px, calc(var(--base-font-size) * 0.75), 16px);
  color: #f78989;
  line-height: 1.3;
}

.ticket-dialog-footer {
  width: 100%;
  display: flex;
  justify-content: center;
  margin-top: 18px; /* 增加间距（原10px * 1.75） */
}

.dialog-btn {
  background-color: #67c23a;
  color: white;
  border: none;
  border-radius: 11px; /* 增加圆角（原6px * 1.75） */
  padding: 18px 53px; /* 增加内边距（原10px 30px * 1.75） */
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  transition: all 0.3s;
  box-shadow: 0 4px 11px rgba(103, 194, 58, 0.4); /* 增加阴影 */
  min-height: 80px; /* 增加最小高度 */
}

.dialog-btn:hover {
  background-color: #85ce61;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(103, 194, 58, 0.5);
}

.dialog-btn .chinese-text {
  margin-bottom: 2px;
  font-size: calc(var(--base-font-size) * 1.1) !important;
  color: white;
  font-weight: bold;
}

.dialog-btn .english-text {
  font-size: calc(var(--base-font-size) * 0.8) !important;
  color: rgba(255, 255, 255, 0.9);
}

/* 响应式布局 - 大屏幕（24寸显示器） */
@media (min-width: 1400px) {
  .business-type-grid {
    grid-template-columns: 1fr !important; /* 强制单列显示 */
    max-width: 1750px; /* 增加最大宽度（原1000px * 1.75） */
    width: 95% !important; /* 确保宽度足够 */
  }
  
  .ticket-dialog {
    max-width: 963px; /* 在大屏幕上增加弹窗最大宽度（原550px * 1.75） */
  }
  
  .ticket-dialog-content {
    padding: 35px; /* 在大屏幕上增加内边距（原20px * 1.75） */
  }
  
  .business-type-btn {
    max-height: 260px !important; /* 在大屏幕上进一步增加按钮高度 */
    min-height: 200px !important;
    width: 100% !important; /* 确保占满整行 */
    padding: 3vh 3vw !important; /* 增加内边距 */
    font-size: calc(var(--base-font-size) * 1.2) !important; /* 增大字体 */
  }
  
  .header {
    min-height: 180px !important; /* 在大屏幕上进一步增加header高度 */
    padding: 25px 0 !important; /* 增加上下内边距 */
  }
  
  .header-content {
    width: calc(100% - 180px); /* 适应增加的header高度 */
    padding: 0; /* 移除内容区域的上下内边距 */
  }
  
  .business-types-view {
    padding-top: 220px; /* 进一步增加顶部内边距，确保不被header遮挡 */
  }
  
  .btn-code {
    font-size: clamp(70px, 8vw, 80px) !important; /* 增大代码字体 */
    min-width: 120px !important;
  }
  
  .btn-chinese-text {
    font-size: clamp(42px, 7vw, 50px) !important; /* 增大中文字体 */
  }
  
  .btn-english-text {
    font-size: clamp(38px, 5.5vw, 42px) !important; /* 增大英文字体 */
  }
  
  .get-ticket-section {
    height: 140px; /* 在大屏幕上进一步增加高度 */
  }
  
  .get-ticket-btn {
    height: 110px; /* 在大屏幕上进一步增加按钮高度 */
    min-width: 250px;
  }
  
  .header {
    min-height: 140px; /* 在大屏幕上进一步增加header高度 */
  }
}

/* 响应式布局 - 平板电脑 */
@media (max-width: 1024px) {
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
  .business-types-view {
    padding-top: 75px; /* 调整顶部内边距，适应70px高的header */
    padding-bottom: 75px; /* 为大型手机调整底部内边距 */
  }
  
  .business-type-grid {
    grid-template-columns: 1fr;
    width: 90%;
    margin-bottom: 0; /* 移除底部边距 */
  }
  
  .header {
    min-height: 65px; /* 调整header高度，小于PC端高度 */
    padding-top: 4px; /* 调整顶部内边距 */
    padding-bottom: 4px; /* 调整底部内边距 */
  }
  
  .header h1 {
    font-size: calc(var(--base-font-size) * 1.4);
    margin-bottom: 5px; /* 增加底部边距 */
    line-height: 1.2; /* 增加行高 */
  }
  
  .header h2 {
    font-size: calc(var(--base-font-size) * 0.85);
    line-height: 1.1; /* 增加行高 */
  }
  
  .business-type-btn {
    padding: 10px 15px; /* 增加左右内边距以适应横向布局 */
    height: 80px; /* 固定高度 */
    max-height: none;
    min-height: 80px;
    flex-direction: row; /* 确保横向布局 */
    border-left: 5px solid #409EFF; /* 左边框 */
    border-top: none; /* 移除顶部边框 */
  }
  
  .get-ticket-section {
    padding: 0.5vh 0; /* 减小内边距 */
  }
  
  .get-ticket-btn {
    width: 60%;
    padding: 1vh 8vw; /* 减小内边距 */
  }
}

/* 响应式布局 - 小型手机 */
@media (max-width: 480px) {
  .business-types-view {
    padding-top: 65px; /* 调整顶部内边距，适应更小的header */
    padding-bottom: 60px; /* 为小屏幕设备减小底部内边距 */
  }

  .header {
    min-height: 60px; /* 调整header高度，比大型手机更小 */
    padding-top: 3px; /* 调整顶部内边距 */
    padding-bottom: 3px; /* 调整底部内边距 */
  }
  
  .header h1 {
    font-size: calc(var(--base-font-size) * 1.3); /* 增大标题字体 */
    margin-top: 0; /* 移除顶部边距 */
    margin-bottom: 3px; /* 增加底部边距 */
    line-height: 1.2; /* 增加行高 */
  }
  
  .header h2 {
    font-size: calc(var(--base-font-size) * 0.8); /* 增大副标题字体 */
    margin-bottom: 0; /* 移除底部边距 */
    line-height: 1.1; /* 增加行高 */
  }
  
  .business-type-grid {
    width: 95%;
    gap: 8px;
    margin-top: 1vh; /* 减小与header的距离 */
    margin-bottom: 0; /* 移除底部外边距 */
  }
  
  .business-type-btn {
    padding: 6px 10px; /* 增加左右内边距以适应横向布局 */
    height: 65px; /* 减小高度 */
    max-height: 65px;
    min-height: 65px;
    margin-bottom: 0.5vh; /* 减小底部边距 */
    flex-direction: row; /* 确保横向布局 */
    border-left: 4px solid #409EFF; /* 左边框 */
    border-top: none; /* 移除顶部边框 */
  }
  
  .btn-code {
    margin: 0; /* 移除边距 */
    font-size: clamp(16px, 4vw, 22px); /* 调整小屏幕下的代码字体大小 */
    min-width: 50px; /* 设置最小宽度 */
  }
  
  .btn-chinese-text {
    margin-bottom: 0.2rem;
    font-size: clamp(14px, 3.5vw, 20px); /* 调整小屏幕下的中文字体大小 */
  }
  
  .btn-english-text {
    font-size: clamp(11px, 2.6vw, 16px); /* 调整小屏幕下的英文字体大小 */
  }
  
  .ticket-number {
    font-size: calc(var(--base-font-size) * 2.5);
  }
  
  .get-ticket-section {
    padding: 0.4vh 0;
    height: 50px; /* 减小固定高度 */
  }
  
  .get-ticket-btn {
    width: 70%;
    padding: 0.6vh 8vw;
    height: 40px; /* 减小按钮高度 */
  }
  
  .get-ticket-btn .chinese-text {
    margin-bottom: 0;
  }
}
</style>
