<template>
  <div class="counter-wrapper">
    <!-- 未找到柜台时显示提示 -->
    <div v-if="!counterFound" class="unsupported-device-message">
      <div class="message-content">
        <div class="chinese-text">當前設備不支持</div>
        <div class="english-text">Current device is not supported</div>
      </div>
    </div>
    
    <!-- 找到柜台时显示正常内容 -->
    <div v-else class="counter-container">
    <!-- 顶部信息栏 -->
    <div class="header-bar">
      <div class="counter-number"># {{ displayCounterNumber }}</div>
      <div class="date-time">
        {{ dateTimeFormatted }}
      </div>
    </div>
    
    <!-- 主要内容区 -->
    <div class="main-section">
      <!-- 顶部业务类型和等待人数，水平排列 -->
      <div class="business-section">
        <div class="business-cards">
          <div 
            v-for="type in businessTypes" 
            :key="type.id" 
            :class="['business-card', currentBusinessType && currentBusinessType.id === type.id ? 'selected' : '']"
            @click="selectBusinessType(type)"
          >
            <div class="business-info">
              <div class="business-type-code">{{ type.code || 'CODE' }}</div>
            </div>
            <div class="waiting-info">
              <div class="waiting-label">waiting</div>
              <div class="count-number">{{ getWaitingCount(type.id) }}</div>
            </div>
            <div class="last-service-info">
              <div :class="['last-service-number', { 'default-value': isDefaultServiceNumber(type.id) }]">{{ getLastServiceNumber(type.id) }}</div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 底部控制区域 -->
      <div class="control-area">
        <!-- 左侧四个按钮 -->
        <div class="control-buttons-section">
          <button 
            @click="callNext" 
            :disabled="!currentBusinessType || isServiceStarted"
            class="control-button next-btn"
          >
            <el-icon><ArrowRight /></el-icon>
            <span>Next</span>
          </button>
          
          <button 
            @click="recallTicket" 
            :disabled="isServiceStarted"
            class="control-button recall-btn"
          >
            <el-icon><Bell /></el-icon>
            <span>Recall</span>
          </button>
          
          <button 
            @click="startService" 
            :disabled="!isUserInputting || !inputDisplay || inputDisplay === 'Input'"
            class="control-button start-btn"
          >
            <el-icon><VideoPlay /></el-icon>
            <span>Start</span>
          </button>
          
          <button 
            @click="completeService" 
            :disabled="!isServiceStarted"
            class="control-button end-btn"
          >
            <el-icon><Check /></el-icon>
            <span>End</span>
          </button>
        </div>
        
        <!-- 中间显示区域和字母按钮 -->
        <div class="input-section">
          <div :class="['input-display', { 'input-placeholder': !inputDisplay || inputDisplay === 'Input' }]">
            {{ inputDisplay || 'Input' }}
          </div>
          
          <div class="code-buttons">
            <button 
              v-for="code in businessTypeCodes" 
              :key="code" 
              class="code-button"
              @click="appendToInput(code)"
            >
              {{ code }}
            </button>
          </div>
        </div>
        
        <!-- 右侧数字键盘 -->
        <div class="number-keypad-section">
          <div class="keypad-row">
            <button class="num-button" @click="appendToInput('1')">1</button>
            <button class="num-button" @click="appendToInput('2')">2</button>
            <button class="num-button" @click="appendToInput('3')">3</button>
          </div>
          <div class="keypad-row">
            <button class="num-button" @click="appendToInput('4')">4</button>
            <button class="num-button" @click="appendToInput('5')">5</button>
            <button class="num-button" @click="appendToInput('6')">6</button>
          </div>
          <div class="keypad-row">
            <button class="num-button" @click="appendToInput('7')">7</button>
            <button class="num-button" @click="appendToInput('8')">8</button>
            <button class="num-button" @click="appendToInput('9')">9</button>
          </div>
          <div class="keypad-row">
            <button class="func-button ac-button" @click="clearInput()">AC</button>
            <button class="num-button" @click="appendToInput('0')">0</button>
            <button class="func-button del-button" @click="deleteLastChar()">Del</button>
          </div>
        </div>
      </div>
    </div>
  </div>
  </div>
  
  <!-- Toast 提示 -->
  <transition name="toast-fade">
    <div v-if="showToast" class="toast-message">
      <div class="toast-content">
        <div class="toast-icon">✓</div>
        <div class="toast-text">
          <div class="chinese-text">{{ toastMessage.chinese }}</div>
          <div class="english-text">{{ toastMessage.english }}</div>
        </div>
      </div>
    </div>
  </transition>
  
  <!-- 自定义提示弹窗 -->
  <div v-if="showDialog" class="custom-dialog-overlay" @click="closeDialog">
    <div class="custom-dialog" @click.stop>
      <div class="dialog-icon">
        <div class="error-icon">!</div>
      </div>
      <div class="dialog-content">
        <div class="dialog-title">
          <div class="chinese-text">提示</div>
          <div class="english-text">Reminder</div>
        </div>
        <div class="dialog-message">
          <div class="chinese-text">{{ dialogMessage.chinese }}</div>
          <div class="english-text">{{ dialogMessage.english }}</div>
        </div>
      </div>
      <div class="dialog-footer">
        <button class="dialog-btn" @click="closeDialog">
          <div class="chinese-text">確定</div>
          <div class="english-text">OK</div>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { businessTypeService, counterService, ticketService } from '@/api';
import socket from '@/socket';
import { ArrowRight, Bell, VideoPlay, Check } from '@element-plus/icons-vue';

// 状态相关
const status = ref('available'); // 默认为可用状态
const counterNumber = ref(1); // 当前窗口号
const displayCounterNumber = computed(() => String(counterNumber.value).padStart(2, '0'));
const businessTypes = ref([]);
const waitingCounts = ref({}); // 使用对象存储，key为businessTypeId，value为等待人数
const currentBusinessType = ref(null);
const inputDisplay = ref('');
const businessTypeCodes = ref([]);
const lastServiceNumbers = ref({}); // 存储各业务类型的上一个服务号
const currentTicketNumber = ref(''); // 当前柜台的票号
const isUserInputting = ref(false); // 标记用户是否正在输入
const isServiceStarted = ref(false); // 标记服务是否已开始
const showDialog = ref(false); // 控制弹窗显示
const dialogMessage = ref({ chinese: '', english: '' }); // 弹窗消息内容
const counterFound = ref(false); // 标记是否找到对应的柜台
const showToast = ref(false); // 控制 toast 显示
const toastMessage = ref({ chinese: '', english: '' }); // toast 消息内容
let toastTimer = null; // toast 定时器

// 日期和时间格式化后的字符串
const dateTimeFormatted = ref('');

// 按照指定格式 (2025-11-07 Fri 12:31) 更新日期和时间
const updateDateTime = () => {
  const now = new Date();
  
  // 格式化年-月-日
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;
  
  // 获取星期几的简写
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const weekday = weekdays[now.getDay()];
  
  // 格式化时间
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const timeStr = `${hours}:${minutes}:${seconds}`;
  
  // 组合成最终格式
  dateTimeFormatted.value = `${dateStr} ${weekday} ${timeStr}`;
};

// 初始化时间并设置定时器每秒更新
updateDateTime();
setInterval(updateDateTime, 1000);

// 移除状态文本映射

// 获取等待人数
const getWaitingCount = (businessTypeId) => {
  // 从waitingCounts中查找对应业务类型的等待人数
  const count = waitingCounts.value[businessTypeId];
  // 如果存在则返回，否则返回0
  return count !== undefined ? count : 0;
};

// 获取上一个服务号
const getLastServiceNumber = (businessTypeId) => {
  // 如果存在此业务类型的上一个服务号，则返回它
  const lastTicketNo = lastServiceNumbers.value[businessTypeId];
  if (lastTicketNo) {
    return lastTicketNo;
  }
  // 否则返回默认值
  // 根据业务类型ID查找对应的code
  const businessType = businessTypes.value.find(type => type.id === businessTypeId);
  const code = businessType?.code || 'CODE';
  return code + '000';
};

// 检查是否是默认服务号（code + '000'）
const isDefaultServiceNumber = (businessTypeId) => {
  // 如果不存在此业务类型的上一个服务号，则为默认值
  const lastTicketNo = lastServiceNumbers.value[businessTypeId];
  return !lastTicketNo;
};

// 获取等待人数数据
const fetchWaitingCounts = async () => {
  try {
    // 使用批量接口一次性获取所有业务类型的等待人数
    const response = await ticketService.getAllWaitingCounts();
    // 后端返回格式: { businessTypeId: waitingCount, ... }
    waitingCounts.value = response.data || {};
    // console.log('等待人数已更新:', waitingCounts.value);
  } catch (error) {
    console.error('获取等待人数失败:', error);
    // 出错时将所有业务类型的等待人数设为0
    const counts = {};
    if (businessTypes.value && businessTypes.value.length > 0) {
      businessTypes.value.forEach(type => {
        counts[type.id] = 0;
      });
    }
    waitingCounts.value = counts;
  }
};

// 获取各业务类型的上一个服务号
const fetchLastServiceNumbers = async () => {
  try {
    // 如果还没有柜台号，先不查询
    if (!counterNumber.value || counterNumber.value === 0) {
      return;
    }
    
    // 调用API获取当前柜台所有业务类型的上一个服务号
    const response = await counterService.getLastServiceNumbers(counterNumber.value);
    // 后端返回格式: { businessTypeId: last_ticket_no, ... }
    lastServiceNumbers.value = response.data || {};
    // console.log('上一个服务号已更新:', lastServiceNumbers.value);
  } catch (error) {
    console.error('获取上一个服务号失败:', error);
    // 出错时清空数据
    lastServiceNumbers.value = {};
  }
};

// 获取客户端IP地址
const getClientIP = async () => {
  try {
    // 使用我们自己的后端API获取IP地址
    const response = await counterService.getClientIP();
    if (response && response.data && response.data.ip) {
      // 处理IPv4地址格式（可能含有IPv6前缀）
      let ip = response.data.ip;
      // 如果是IPv6格式的本地地址(::ffff:127.0.0.1)，提取IPv4部分
      if (ip.includes('::ffff:')) {
        ip = ip.split('::ffff:')[1];
      }
      console.log('获取到的IP地址:', ip);
      return ip;
    }
    return null;
  } catch (error) {
    console.error('获取IP地址失败:', error);
    return null;
  }
};

// 获取当前柜台的票号
const fetchCurrentTicketNumber = async () => {
  try {
    // 如果还没有柜台号，先不查询
    if (!counterNumber.value || counterNumber.value === 0) {
      return;
    }
    
    // 使用新接口直接根据柜台号获取柜台信息
    const response = await counterService.getByNumber(counterNumber.value);
    const counter = response.data;
    
    if (counter) {
      // 获取 current_ticket_number 字段（可能是 current_ticket_number 或 currentTicketNumber）
      const ticketNumber = counter.current_ticket_number || counter.currentTicketNumber || '';
      currentTicketNumber.value = ticketNumber;
      
      // 如果用户没有在输入，则更新显示
      if (!isUserInputting.value) {
        inputDisplay.value = ticketNumber || 'Input';
      }
      // console.log('当前票号已更新:', ticketNumber);
    } else {
      console.warn('未找到当前柜台信息');
      if (!isUserInputting.value) {
        inputDisplay.value = 'Input';
      }
    }
  } catch (error) {
    console.error('获取当前票号失败:', error);
    if (!isUserInputting.value) {
      inputDisplay.value = 'Input';
    }
  }
};

// 获取窗口号
const fetchCounterNumber = async () => {
  try {
    // 获取客户端IP地址
    const clientIP = await getClientIP();
    
    let counter = null;
    
    // 本地开发环境特殊处理
    if (clientIP === '127.0.0.1' || clientIP === 'localhost') {
      console.log('检测到本地开发环境，尝试获取可用柜台列表');
      
      // 1. 优先尝试找到IP为10.10.8.58的柜台（根据您提供的信息）
      try {
        const response = await counterService.getByIP('10.10.8.58');
        counter = response.data;
        if (counter) {
          counterNumber.value = counter.counter_number;
          counterFound.value = true; // 标记已找到柜台
          console.log('已找到指定IP(10.10.8.58)柜台:', counter);
          showMessageDialog(
            `當前運行在本地開發環境，自動選擇IP為${counter.ip_address}的櫃台。櫃台號：${counter.counter_number}`,
            `Running in local development environment, automatically selected counter with IP ${counter.ip_address}. Counter number: ${counter.counter_number}`
          );
          await fetchCurrentTicketNumber();
          await fetchLastServiceNumbers();
          return;
        }
      } catch (error) {
        // IP不存在，继续尝试其他方式
      }
      
      // 2. 如果没找到指定IP，获取所有柜台并使用第一个
      try {
        const response = await counterService.getAll();
        const counters = response.data;
        if (counters && counters.length > 0) {
          counter = counters[0];
          counterNumber.value = counter.counter_number;
          counterFound.value = true; // 标记已找到柜台
          console.log('使用第一个可用的柜台:', counter);
          showMessageDialog(
            `當前運行在本地開發環境，自動選擇第一個可用櫃台。櫃台號：${counter.counter_number}`,
            `Running in local development environment, automatically selected the first available counter. Counter number: ${counter.counter_number}`
          );
          await fetchCurrentTicketNumber();
          await fetchLastServiceNumbers();
          return;
        }
      } catch (error) {
        console.error('获取柜台列表失败:', error);
      }
    } else {
      // 生产环境：使用新接口根据IP自动匹配柜台
      try {
        const response = await counterService.getByIPOrNumber(clientIP, null);
        counter = response.data;
        if (counter) {
          counterNumber.value = counter.counter_number;
          counterFound.value = true; // 标记已找到柜台
          console.log('已找到匹配的柜台:', counter);
          await fetchCurrentTicketNumber();
          await fetchLastServiceNumbers();
          return;
        }
      } catch (error) {
        // 如果根据IP找不到，继续处理
        console.warn('根据IP未找到匹配的柜台:', error);
      }
    }
    
    // 未匹配到柜台时
    console.warn('未找到匹配的柜台，使用默认值');
    counterNumber.value = 0; // 默认值
    counterFound.value = false; // 标记未找到柜台
    // 不显示弹窗，直接显示不支持提示
  } catch (error) {
    console.error('获取窗口号失败:', error);
    counterNumber.value = 0; // 出错时使用默认值
    counterFound.value = false; // 标记未找到柜台
    // 不显示弹窗，直接显示不支持提示
  }
};

onMounted(async () => {
  try {
    // 获取窗口号
    await fetchCounterNumber();
    
    // 获取业务类型
    const response = await businessTypeService.getAll();
    businessTypes.value = response.data;
    
    // 从业务类型中提取 code 字段作为字母按钮
    businessTypeCodes.value = response.data.map(type => type.code);
    
    // 获取等待人数
    await fetchWaitingCounts();
    
    // 获取上一个服务号
    await fetchLastServiceNumbers();
    
    // 定期刷新等待人数（每10秒）
    setInterval(fetchWaitingCounts, 10000);
    
    // 定期刷新当前票号（每5秒）
    setInterval(fetchCurrentTicketNumber, 5000);
    
    // 定期刷新上一个服务号（每10秒）
    setInterval(fetchLastServiceNumbers, 10000);
    
    // 获取窗口信息（实际应用中可能需要登录或其他方式获取）
    // 这里简化处理
  } catch (error) {
    console.error('初始化数据失败:', error);
  }
  
  // 监听票号更新事件，刷新所有数据
  socket.on('ticket:created', async () => {
    console.log('收到取票事件，刷新所有数据');
    // 立即刷新所有相关数据
    await Promise.all([
      fetchWaitingCounts(),        // 刷新等待人数
      fetchCurrentTicketNumber(),   // 刷新当前票号
      fetchLastServiceNumbers()    // 刷新上一个服务号
    ]);
  });
  socket.on('ticket:statusUpdated', () => {
    fetchWaitingCounts();
    fetchLastServiceNumbers();
    fetchCurrentTicketNumber(); // 票号更新时也刷新当前票号
  });
  
  // 监听叫号事件，所有柜台页面都刷新数据
  socket.on('ticket:nextCalled', async () => {
    console.log('收到叫号事件，刷新所有数据');
    // 立即刷新所有相关数据
    await Promise.all([
      fetchWaitingCounts(),        // 刷新等待人数
      fetchCurrentTicketNumber(),  // 刷新当前票号
      fetchLastServiceNumbers()    // 刷新上一个服务号
    ]);
  });
});

// 组件卸载时清理定时器
onUnmounted(() => {
  if (toastTimer) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }
});

const selectBusinessType = (type) => {
  currentBusinessType.value = type;
};

// 显示弹窗
const showMessageDialog = (chinese, english) => {
  dialogMessage.value = { chinese, english };
  showDialog.value = true;
};

// 关闭弹窗
const closeDialog = () => {
  showDialog.value = false;
};

// 显示 toast 提示
const showToastMessage = (chinese, english) => {
  toastMessage.value = { chinese, english };
  showToast.value = true;
  
  // 清除之前的定时器
  if (toastTimer) {
    clearTimeout(toastTimer);
  }
  
  // 3秒后自动隐藏
  toastTimer = setTimeout(() => {
    showToast.value = false;
  }, 1000);
};

const callNext = async () => {
  // 注意：业务类型和服务状态的检查已通过按钮的disabled属性控制，不会触发
  // 但柜台号的检查需要保留，因为按钮没有检查这个条件
  
  if (!counterNumber.value || counterNumber.value === 0) {
    showMessageDialog('未找到當前櫃台，請刷新頁面重試', 'Counter not found, please refresh the page and try again');
    return;
  }
  
  // 检查等待人数是否为0
  const waitingCount = getWaitingCount(currentBusinessType.value.id);
  if (waitingCount === 0) {
    showMessageDialog('該服務當前無等待人數', 'This service currently has no waiting customers');
    return;
  }
  
  try {
    // 调用后端API处理叫号
    await ticketService.callNext(currentBusinessType.value.id, counterNumber.value);
    
    // 立即刷新页面数据
    await Promise.all([
      fetchWaitingCounts(),        // 刷新等待人数
      fetchCurrentTicketNumber(),  // 刷新当前票号
      fetchLastServiceNumbers()    // 刷新上一个服务号
    ]);
    
    // 取消业务类型选中
    currentBusinessType.value = null;
    
    // 显示成功提示
    showToastMessage('叫號成功', 'Call successful');
    
    console.log('叫号成功，数据已刷新');
  } catch (error) {
    console.error('叫号失败:', error);
    const errorMsg = error.response?.data?.message || error.message || '未知錯誤';
    showMessageDialog('叫號失敗：' + errorMsg, 'Call failed: ' + errorMsg);
  }
};

const recallTicket = () => {
  // 注意：服务状态的检查已通过按钮的disabled属性控制，不会触发
  
  // 检查等待人数是否为0（recall需要当前有等待的客户）
  if (currentBusinessType.value) {
    const waitingCount = getWaitingCount(currentBusinessType.value.id);
    if (waitingCount === 0) {
      showMessageDialog('該服務當前無等待人數', 'This service currently has no waiting customers');
      return;
    }
  }
  
  try {
    // 重新叫号功能
    // 实际应用中应该调用socket或API
    socket.emit('ticket:recall', {
      counterNumber: counterNumber.value || 1
    });
    
    // 显示成功提示
    showToastMessage('重新叫號成功', 'Recall successful');
  } catch (error) {
    console.error('重新叫号失败:', error);
    showMessageDialog('重新叫號失敗', 'Recall failed');
  }
};

const startService = () => {
  // 注意：输入状态的检查已通过按钮的disabled属性控制，不会触发
  
  try {
    // 开始服务功能
    isServiceStarted.value = true;
    console.log('开始服务，输入的服务号:', inputDisplay.value);
    
    // 显示成功提示
    showToastMessage('服務已開始', 'Service started');
    
    // 这里可以添加语音播报或其他逻辑
    // 稍后实现传递信号进行语音播报
  } catch (error) {
    console.error('开始服务失败:', error);
  }
};

const completeService = async () => {
  // 注意：服务状态的检查已通过按钮的disabled属性控制，不会触发
  
  try {
    // 完成服务
    if (counterNumber.value && counterNumber.value !== 0) {
      await counterService.endService(counterNumber.value);
    }
    
    // 重置服务状态
    isServiceStarted.value = false;
    
    // 清空输入
    inputDisplay.value = '';
    isUserInputting.value = false;
    inputDisplay.value = currentTicketNumber.value || 'Input';
    
    console.log('服务已完成');
    
    // 显示成功提示
    showToastMessage('服務已完成', 'Service completed');
    
    // 刷新等待人数
    fetchWaitingCounts();
  } catch (error) {
    console.error('完成服务失败:', error);
    const errorMsg = error.response?.data?.message || error.message || '未知錯誤';
    showMessageDialog('完成服務失敗：' + errorMsg, 'Service completion failed: ' + errorMsg);
  }
};

// 将业务代码添加到输入显示
const appendToInput = (code) => {
  // 如果用户开始输入，标记为正在输入状态
  if (!isUserInputting.value) {
    isUserInputting.value = true;
    inputDisplay.value = ''; // 清空当前票号显示
  }
  
  if (inputDisplay.value.length < 5) {
    inputDisplay.value += code;
  }
};

// 清空输入显示
const clearInput = () => {
  inputDisplay.value = '';
  isUserInputting.value = false;
  // 清空当前票号显示，显示Input
  inputDisplay.value = 'Input';
};

// 删除最后一个字符
const deleteLastChar = () => {
  if (isUserInputting.value) {
    if (inputDisplay.value.length > 0) {
      inputDisplay.value = inputDisplay.value.slice(0, -1);
    }
    // 如果删除后为空，清空当前票号显示，显示Input
    if (inputDisplay.value.length === 0) {
      isUserInputting.value = false;
      inputDisplay.value = 'Input';
    }
  }
};

</script>



<style scoped>
/* 全局样式 */
.counter-wrapper {
  position: relative;
  height: 100vh;
  max-height: 100vh;
  width: 100vw;
  overflow: hidden;
  background-color: #f0f2f5;
}

.counter-wrapper::before {
  content: '';
  position: absolute;
  top: -150px;
  left: -10%;
  right: -10%;
  height: 300px;
  background: linear-gradient(135deg, #409EFF 0%, #64B5F6 100%);
  border-radius: 50%;
  opacity: 0.08;
  z-index: 0;
  transform: scaleX(1.2);
}

.counter-wrapper::after {
  content: '';
  position: absolute;
  bottom: -150px;
  left: -10%;
  right: -10%;
  height: 300px;
  background: linear-gradient(135deg, #67C23A 0%, #95D475 100%);
  border-radius: 50%;
  opacity: 0.08;
  z-index: 0;
  transform: scaleX(1.2);
}

.counter-container {
  position: relative;
  padding: 0.25vh 1vw;
  height: calc(100vh - 0.5vh);
  max-height: calc(100vh - 0.5vh);
  background-color: white;
  font-family: 'Arial', sans-serif;
  display: flex;
  flex-direction: column;
  gap: 1px;
  overflow: hidden;
  border-radius: 25px;
  box-shadow: 0 5px 20px rgba(0, 0, 0, 0.05);
  margin: 0.25vh 0.25vw;
  z-index: 1;
  border: 1px solid rgba(234, 237, 242, 0.8);
}

.section-title {
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 10px;
  color: #303133;
  border-left: 4px solid #409EFF;
  padding-left: 10px;
}

/* 顶部信息栏 */
.header-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px 10px;
  margin-bottom: 0;
  border-bottom: 1px solid rgba(234, 237, 242, 0.8);
  border-radius: 15px 15px 0 0;
  background-color: rgba(250, 252, 254, 0.8);
}

.counter-number {
  font-size: 1.3rem;
  font-weight: bold;
  color: #409EFF;
}

.date-time {
  font-size: 1.1rem;
  color: #606266;
  font-weight: 500;
  text-align: right;
}

/* 中间主要内容区 */
.main-section {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  overflow: hidden;
  height: calc(100% - 50px); /* 减去顶部区域的高度 */
}

/* 底部控制区域 - 三栏布局 */
.control-area {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr; /* 三等分布局 */
  gap: 15px; /* 增加列间距 */
  flex: 1; /* 占用50%的高度 */
  overflow: hidden;
  margin-bottom: 0;
  padding-bottom: 0;
  border-top: 1px solid rgba(234, 237, 242, 0.8);
  padding-top: 1px;
  margin-top: 1px;
  padding-left: 8px;
  padding-right: 8px;
}

/* 业务类型区域 */
.business-section {
  padding: 0;
  width: 100%; /* 确保占满整个宽度 */
  margin-bottom: 0;
  flex: 1; /* 占用50%的高度 */
  display: flex;
  flex-direction: column;
}

.business-cards {
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap; /* 保持单行 */
  gap: 18px;
  justify-content: space-between;
  padding: 5px;
  flex: 1;
  align-items: center; /* 垂直居中 */
  height: 100%; /* 占满整个高度 */
  overflow-x: auto; /* 在小屏幕上允许水平滚动 */
  scrollbar-width: none; /* Firefox */
}

.business-cards::-webkit-scrollbar {
  display: none; /* Chrome, Safari, Edge */
}

.business-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  padding: 3px 0;
  border-radius: 10px;
  border: 1px solid #EBEEF5;
  background-color: #f9f9f9;
  transition: all 0.3s;
  cursor: pointer;
  min-width: 110px; /* 最小宽度增加 */
  flex: 1; /* 平均分配空间 */
  height: calc(100% - 10px); /* 尽可能高，减去margin */
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.02);
  margin-bottom: 5px;
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
  text-align: center;
  margin-bottom: 6px;
  padding-top: 10px;
}

.business-type-code {
  font-size: 3rem;
  font-weight: bold;
  color: #303133;
}

.waiting-info {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.waiting-label {
  font-size: 1rem;
  color: #909399;
  margin-bottom: 3px;
}

.count-number {
  font-size: 2rem;
  color: #f56c6c;
  font-weight: bold;
}

.last-service-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  border-top: 1px dashed #EBEEF5;
  padding-top: 3px;
}

.last-service-number {
  font-size: 1.6rem;
  font-weight: bold;
  color: #409EFF;
}

.last-service-number.default-value {
  color: #909399;
}

/* 左侧控制按钮区域 */
.control-buttons-section {
  padding: 4px 2px;
  display: flex;
  flex-direction: column;
  gap: 15px;
  justify-content: center;
  align-items: center;
}

.control-button {
  padding: 5px;
  font-size: 1.2rem;
  font-weight: 700;
  width: 100%;
  height: 48px;
  border-radius: 4px;
  border: 1px solid transparent;
  cursor: pointer;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.3s;
}

.control-button .el-icon {
  font-size: 1.3rem;
  font-weight: bold;
  stroke-width: 2px; /* 增加SVG图标的线条粗细 */
}

.next-btn {
  background-color: #409EFF;
  color: white;
}

.next-btn:hover {
  background-color: #66b1ff;
}

.recall-btn {
  background-color: #E6A23C;
  color: white;
}

.recall-btn:hover {
  background-color: #ebb563;
}

.start-btn {
  background-color: #409EFF; /* #909399; */
  color: white;
}

.start-btn:hover {
  background-color: #66b1ff; /* #a6a9ad; */
}

.end-btn {
  background-color: #67C23A;
  color: white;
}

.end-btn:hover {
  background-color: #85ce61;
}

.control-button:disabled {
  background-color: #c0c4cc;
  color: white;
  cursor: not-allowed;
  border-color: #c0c4cc;
}

/* 中间输入区域 */
.input-section {
  padding: 4px 2px;
  display: flex;
  flex-direction: column;
  gap: 15px;
  justify-content: center; /* 垂直居中 */
  align-items: center; /* 确保子元素水平居中 */
  width: 100%; /* 确保占满整个宽度 */
}

.input-display {
  background-color: #f5f7fa;
  border: 1px solid #dcdfe6;
  border-radius: 10px;
  padding: 15px;
  font-size: 2.6rem;
  min-height: 90px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  font-weight: bold;
  color: #409EFF;
  margin: 0 auto; /* 水平居中 */
  width: 90%; /* 控制宽度 */
  box-sizing: border-box; /* 确保内边距和边框都计入宽度 */
}

.input-display.input-placeholder {
  color: #909399; /* 灰色文字 */
}

.code-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  width: 90%; /* 与输入显示区域相同宽度 */
  margin: 0 auto; /* 水平居中 */
  box-sizing: border-box; /* 确保内边距和边框都计入宽度 */
}

.code-button {
  width: 36px;
  height: 36px;
  background-color: #f0f2f5;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.4rem;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
  box-sizing: border-box; /* 确保内边距和边框都计入宽度 */
}

.code-button:hover {
  background-color: #ecf5ff;
  border-color: #409EFF;
  color: #409EFF;
}

.number-keypad-section {
  padding: 4px 5px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  justify-content: center;
  align-items: center;
  width: 100%; /* 确保占满整个宽度 */
}

.keypad-row {
  display: flex;
  gap: 10px;
  width: 100%;
}

.num-button, .func-button {
  width: 50px;
  height: 50px;
  border-radius: 4px;
  border: 1px solid #dcdfe6;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.6rem;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
  flex: 1;
  min-width: 50px; /* 确保最小宽度与高度一致，更接近正方形 */
  max-width: none; /* 允许按钮填充可用空间 */
}

.num-button {
  background-color: #f5f7fa;
}

.num-button:hover {
  background-color: #e4e7ed;
}

.func-button {
  background-color: #f0f2f5;
}

.ac-button {
  color: #f56c6c;
}

.ac-button:hover {
  background-color: #fef0f0;
}

.del-button {
  color: #e6a23c;
}

.del-button:hover {
  background-color: #fdf6ec;
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

/* 圆角按钮美化 */
.control-button, .input-display, .num-button, .func-button, .code-button {
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

/* 响应式布局 */
@media (max-width: 1200px) {
  .main-section {
    height: auto;
    overflow: visible;
  }
  
  .counter-container {
    height: auto;
    min-height: 100vh;
    padding-bottom: 5px;
  }
  
  .control-section {
    grid-template-columns: 1fr;
  }
  
  .business-card {
    min-width: 90px;
    height: calc(100% - 10px);
  }
}

/* 各种屏幕尺寸下的适配 */
@media (max-width: 1200px) {
  /* 三等分保持不变 */
  
  .business-cards {
    min-height: 150px;
  }
  
  .business-card {
    min-height: 140px;
  }
  
  .control-button {
    padding: 8px 0;
    font-size: 0.9rem;
    gap: 4px;
  }
  
  .control-button i {
    font-size: 1rem;
  }
  
  .num-button, .func-button {
    width: 45px;
    height: 45px;
  }
}

@media (max-width: 992px) {
  /* 三等分保持不变 */
  .input-section {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  
  .control-button {
    height: 55px;
    font-size: 1.5rem;
    padding: 10px 0;
    gap: 5px;
    font-weight: 700;
  }
  
  .control-button .el-icon {
    font-size: 1.5rem;
    font-weight: bold;
    stroke-width: 2px;
  }
  
  .input-display {
    min-height: 90px;
    font-size: 2.4rem;
    padding: 15px;
    box-sizing: border-box; /* 确保内边距和边框都计入宽度 */
  }
  
  .code-buttons {
    display: grid;
    grid-template-columns: repeat(5, 1fr); /* 每行5个按钮 */
    grid-template-rows: repeat(2, auto); /* 自动分配为2行 */
    gap: 8px;
    width: 90%; /* 与输入显示区域相同宽度 */
    justify-content: center;
    justify-items: stretch;
    box-sizing: border-box; /* 确保内边距和边框都计入宽度 */
  }
  
  .code-button {
    width: auto; /* 自动适应宽度 */
    height: 45px;
    min-width: 0; /* 移除最小宽度限制 */
    font-size: 1.8rem;
  }
  
  .business-cards {
    min-height: 160px;
  }
  
  .business-card {
    min-height: 160px;
  }

  .business-type-code {
    font-size: 2.5rem;
  }

  .last-service-number {
    font-size: 1.6rem;
  }
  
  .business-info {
    padding-top: 12px;
    margin-bottom: 10px;
  }
  
  .waiting-info {
    margin-bottom: 8px;
  }
  
  .control-buttons-section {
    gap: 18px;
    padding: 6px 2px;
  }
  
  .input-section {
    gap: 18px;
    padding: 6px 2px;
  }
  
  .number-keypad-section {
    gap: 15px;
    padding: 6px 2px;
  }
  
  .keypad-row {
    gap: 12px;
  }
  
  .num-button, .func-button {
    height: 55px;
    width: 55px;
    min-width: 55px;
    max-width: none;
    font-size: 2rem;
  }
}

@media (max-width: 768px) {
  .header-bar {
    padding: 12px 12px;
  }
  
  .counter-number {
    font-size: 1.1rem;
  }
  
  .date-time {
    font-size: 0.9rem;
  }
  
  .business-cards {
    gap: 15px;
    padding: 5px 5px;
    justify-content: space-around;
    min-height: 130px;
  }
  
  .business-card {
    min-width: 85px;
    height: calc(100% - 10px);
    min-height: 120px;
    padding: 5px 0;
    margin: 0 2px;
  }

  .last-service-number {
    font-size: 1.5rem;
  }
  
  .business-type-code {
    font-size: 2rem;
  }
  
  .count-number {
    font-size: 1.5rem;
  }
  
  .control-area {
    /* 三等分保持不变 */
    gap: 10px;
    padding-left: 6px;
    padding-right: 6px;
  }
  
  .control-buttons-section {
    padding: 5px 5px;
    gap: 12px;
  }
  
  .input-section {
    padding: 5px 5px;
    gap: 15px;
  }
  
  .input-display {
    min-height: 80px;
    font-size: 1.6rem;
    padding: 12px;
    box-sizing: border-box; /* 确保内边距和边框都计入宽度 */
  }

  .number-keypad-section {
    padding: 5px 5px;
    gap: 10px;
  }
  
  .keypad-row {
    gap: 8px;
  }
  
  .control-button {
    height: 50px;
    font-size: 1.3rem;
    padding: 5px 0;
    gap: 4px;
    font-weight: 700;
  }
  
  .control-button .el-icon {
    font-size: 1.2rem;
    font-weight: bold;
    stroke-width: 2px;
  }
  
  .code-buttons {
    display: grid;
    grid-template-columns: repeat(5, 1fr); /* 每行5个按钮 */
    grid-template-rows: repeat(2, auto); /* 自动分配为2行 */
    gap: 8px;
    width: 90%; /* 与输入显示区域相同宽度 */
    justify-content: center;
    justify-items: stretch;
    box-sizing: border-box; /* 确保内边距和边框都计入宽度 */
  }

  .code-button {
    width: auto; /* 自动适应宽度 */
    height: 38px;
    min-width: 0; /* 移除最小宽度限制 */
    font-size: 1.5rem;
  }
  
  .num-button, .func-button {
    height: 45px;
    width: 45px;
    min-width: 45px;
    max-width: none;
    font-size: 1.6rem;
  }
}

@media (max-width: 480px) {
  .counter-container {
    padding: 1vh 1vw;
  }
  
  .header-bar {
    padding: 10px 10px;
  }
  
  .counter-number {
    font-size: 1rem;
  }
  
  .date-time {
    font-size: 0.8rem;
  }
  
  .control-area {
    /* 三等分保持不变 */
    gap: 8px;
    padding-left: 4px;
    padding-right: 4px;
  }
  
  .business-card {
    min-width: 70px;
    height: calc(100% - 10px);
    min-height: 110px;
    padding: 3px 0;
    margin: 0 3px;
  }
  
  .last-service-number {
    font-size: 1.1rem;
  }
  
  .business-type-code {
    font-size: 1.1rem;
  }
  
  .waiting-label {
    font-size: 0.9rem;
  }
  
  .count-number {
    font-size: 1.2rem;
  }
  
  .control-buttons-section {
    padding: 3px 3px;
    gap: 10px;
  }
  
  .input-section {
    padding: 3px 3px;
    gap: 12px;
  }
  
  .number-keypad-section {
    padding: 3px 3px;
    gap: 8px;
  }
  
  .keypad-row {
    gap: 6px;
  }
  
  .control-button {
    height: 45px;
    font-size: 1.1rem;
    padding: 4px 0;
    gap: 3px;
    font-weight: 700;
  }
  
  .control-button .el-icon {
    font-size: 1.1rem;
    font-weight: bold;
    stroke-width: 2px;
  }
  
  .input-display {
    min-height: 80px;
    font-size: 1rem;
    padding: 12px;
    box-sizing: border-box; /* 确保内边距和边框都计入宽度 */
  }
  
  .code-buttons {
    display: grid;
    grid-template-columns: repeat(5, 1fr); /* 每行5个按钮 */
    grid-template-rows: repeat(2, auto); /* 自动分配为2行 */
    gap: 5px;
    width: 90%; /* 与输入显示区域相同宽度 */
    justify-content: center;
    justify-items: stretch;
    box-sizing: border-box; /* 确保内边距和边框都计入宽度 */
  }

  .code-button {
    width: auto; /* 自动适应宽度 */
    height: 32px;
    min-width: 0; /* 移除最小宽度限制 */
    font-size: 1.2rem;
    margin: 0;
  }
  
  .num-button, .func-button {
    height: 38px;
    width: 38px;
    min-width: 38px;
    max-width: none;
    font-size: 1.2rem;
  }
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
  z-index: 10000;
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
  font-size: 1.2rem;
  color: #303133;
  margin-bottom: 5px;
  font-weight: bold;
}

.dialog-title .english-text {
  font-size: 1rem;
  color: #606266;
}

.dialog-message {
  margin-top: 10px;
}

.dialog-message .chinese-text {
  font-size: 1.1rem;
  color: #303133;
  margin-bottom: 5px;
}

.dialog-message .english-text {
  font-size: 0.9rem;
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
  min-width: 80px;
}

.dialog-btn:hover {
  background-color: #66b1ff;
}

.dialog-btn .chinese-text {
  font-size: 1rem;
  font-weight: bold;
}

.dialog-btn .english-text {
  font-size: 0.85rem;
  opacity: 0.9;
}

/* 响应式适配 */
@media (max-width: 768px) {
  .custom-dialog {
    width: 95%;
    padding: 15px;
  }
  
  .error-icon {
    width: 50px;
    height: 50px;
    font-size: 30px;
  }
  
  .dialog-title .chinese-text {
    font-size: 1.1rem;
  }
  
  .dialog-title .english-text {
    font-size: 0.9rem;
  }
  
  .dialog-message .chinese-text {
    font-size: 1rem;
  }
  
  .dialog-message .english-text {
    font-size: 0.85rem;
  }
}

/* Toast 提示样式 */
.toast-message {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 10001;
  pointer-events: none;
}

.toast-content {
  display: flex;
  align-items: center;
  gap: 12px;
  background-color: #67c23a;
  color: white;
  padding: 16px 24px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  min-width: 200px;
  max-width: 400px;
}

.toast-icon {
  font-size: 20px;
  font-weight: bold;
  flex-shrink: 0;
}

.toast-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.toast-text .chinese-text {
  font-size: 1.2rem;
  font-weight: 500;
}

.toast-text .english-text {
  font-size: 1rem;
  opacity: 0.95;
}

/* Toast 动画 */
.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: all 0.3s ease;
}

.toast-fade-enter-from {
  opacity: 0;
  transform: translate(-50%, -50%) translateY(-20px);
}

.toast-fade-leave-to {
  opacity: 0;
  transform: translate(-50%, -50%) translateY(20px);
}

/* 设备不支持提示样式 */
.unsupported-device-message {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #f5f7fa;
  z-index: 1;
}

.message-content {
  text-align: center;
  padding: 40px;
  background-color: white;
  border-radius: 10px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  max-width: 500px;
  width: 90%;
}

.message-content .chinese-text {
  font-size: 2rem;
  font-weight: bold;
  color: #303133;
  margin-bottom: 15px;
}

.message-content .english-text {
  font-size: 1.2rem;
  color: #606266;
}

/* 响应式适配 */
@media (max-width: 768px) {
  .message-content {
    padding: 30px 20px;
  }
  
  .message-content .chinese-text {
    font-size: 1.5rem;
  }
  
  .message-content .english-text {
    font-size: 1rem;
  }
}
</style>