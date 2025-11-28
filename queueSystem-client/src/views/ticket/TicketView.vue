<template>
  <div class="ticket-container">
    <div class="content-wrapper">
      <!-- 首页视图 -->
      <div v-if="currentView === 'home'" class="home-view">
        <div class="image-section">
          <img :src="bannerImage" alt="Banner" class="banner-image" />
        </div>
        <!-- 添加日期时间显示 -->
        <div class="date-time-display">
          <div class="current-date">{{ currentDateFormatted }}</div>
          <div class="current-time">{{ currentTimeFormatted }}</div>
        </div>
        <div class="action-section">
          <button class="select-service-btn" @click="showBusinessTypes">
            <div class="chinese-text">選擇辦理業務</div>
            <div class="english-text">Select Service</div>
          </button>
        </div>
      </div>

      <!-- 业务类型选择视图（使用独立组件） -->
      <BusinessTypeSelector 
        v-else-if="currentView === 'business-types'"
        :businessTypes="businessTypesWithEnglish"
        @back="returnToHome"
        @getTicket="handleGetTicket"
        ref="businessTypeSelectorRef"
      />
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
import { businessTypeService, ticketService, counterService } from '@/api';
import socket from '@/socket';
import BusinessTypeSelector from './BusinessTypeSelector.vue';

const businessTypes = ref([]);
const currentDate = ref(new Date());
const timerInterval = ref(null);
const isLoading = ref(false);
const showErrorDialog = ref(false);
const errorType = ref('apiError'); // 'apiError' 或 'noSelection'
const currentView = ref('home'); // 'home' 或 'business-types'
const bannerImage = ref('/pic/ticket_bg.jpg'); // 默认值，会在 onMounted 中从后端获取
const businessTypeSelectorRef = ref(null);

// 语音播放相关
const isVoiceBroadcastHost = ref(false);
const voiceQueue = ref([]);
const isPlaying = ref(false);
let speechSynthesis = null;
let currentUtterance = null;
let availableVoices = []; // 存储可用的语音列表
const voiceVolume = ref(1.0); // 语音音量，默认 1.0
const voiceRate = ref(1.0); // 语音语速，默认 1.0
let isFirstPlay = true; // 标记是否是第一次播放
let isWarmingUp = false; // 标记是否正在预热

// 性能优化相关
const MAX_QUEUE_LENGTH = 50; // 最大队列长度，防止内存溢出
const DEBOUNCE_TIME = 3000; // 去重时间窗口（毫秒），相同票号在3秒内不重复播放
const recentPlayedTickets = new Map(); // 记录最近播放的票号和时间戳

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

// ========== 语音播报相关函数 ==========

// 获取语音音量设置（后端已处理换算）
const fetchVoiceVolume = async () => {
  try {
    const response = await businessTypeService.getVoiceVolume();
    voiceVolume.value = parseFloat(response.data?.value) || 1.0;
    if (voiceVolume.value < 0) voiceVolume.value = 0;
    if (voiceVolume.value > 1) voiceVolume.value = 1;
  } catch (error) {
    voiceVolume.value = 1.0; // 使用默认值
  }
};

// 获取语音语速设置（后端已处理换算）
const fetchVoiceRate = async () => {
  try {
    const response = await businessTypeService.getVoiceRate();
    voiceRate.value = parseFloat(response.data?.value) || 1.0;
    if (voiceRate.value < 0.1) voiceRate.value = 0.1;
    if (voiceRate.value > 10) voiceRate.value = 10;
  } catch (error) {
    voiceRate.value = 1.0; // 使用默认值
  }
};

// 检查当前设备是否是语音播报主机
const checkIsVoiceBroadcastHost = async () => {
  try {
    // 获取 voice_broadcast_host_ip 设置
    const voiceHostIPResponse = await businessTypeService.getVoiceBroadcastHostIP();
    const voiceBroadcastHostIP = voiceHostIPResponse.data?.value || '';
    
    if (!voiceBroadcastHostIP) {
      isVoiceBroadcastHost.value = false;
      return;
    }
    
    // 获取客户端IP地址
    const clientIPResponse = await counterService.getClientIP();
    let clientIP = clientIPResponse.data?.ip || '';
    
    // 处理IPv4地址格式（可能含有IPv6前缀）
    if (clientIP.includes('::ffff:')) {
      clientIP = clientIP.split('::ffff:')[1];
    }
    
    // 比较IP地址
    isVoiceBroadcastHost.value = clientIP === voiceBroadcastHostIP;
    
    if (isVoiceBroadcastHost.value) {
      // 初始化语音合成
      if ('speechSynthesis' in window) {
        speechSynthesis = window.speechSynthesis;
        // 加载语音列表
        loadVoices();
        // 某些浏览器需要等待语音列表加载完成
        if (speechSynthesis.onvoiceschanged !== undefined) {
          speechSynthesis.onvoiceschanged = loadVoices;
        }
      } else {
        console.warn('浏览器不支持语音合成功能');
      }
    }
  } catch (error) {
    console.error('检查语音播报主机失败:', error);
    isVoiceBroadcastHost.value = false;
  }
};

// 生成语音播放文本（返回包含粤语、英文的数组）
const generateVoiceTexts = (ticketNumber, counterNumber) => {
  // 格式化票号：将字母和数字分开，例如 A001 -> A 零零一
  const formatTicketNumber = (ticket, language = 'yue') => {
    if (!ticket) return '';
    
    // 分离字母和数字部分
    const match = ticket.match(/^([A-Za-z]+)(\d+)$/);
    if (match) {
      const letter = match[1];
      const numbers = match[2];
      
      let numberText = '';
      
      if (language === 'yue') {
        // 粤语数字读法（使用粤语数字）
        const numberMap = {
          '0': '零', '1': '一', '2': '二', '3': '三', '4': '四',
          '5': '五', '6': '六', '7': '七', '8': '八', '9': '九'
        };
        for (let i = 0; i < numbers.length; i++) {
          numberText += numberMap[numbers[i]] || numbers[i];
        }
        return `${letter}${numberText}號`; // 使用繁体字"號"
      } else if (language === 'en') {
        // 英文数字读法
        const numberMap = {
          '0': 'zero', '1': 'one', '2': 'two', '3': 'three', '4': 'four',
          '5': 'five', '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine'
        };
        for (let i = 0; i < numbers.length; i++) {
          numberText += (i > 0 ? ' ' : '') + numberMap[numbers[i]] || numbers[i];
        }
        return `${letter} ${numberText}`;
      }
    }
    
    return ticket;
  };
  
  const formattedTicketYue = formatTicketNumber(ticketNumber, 'yue');
  const formattedTicketEn = formatTicketNumber(ticketNumber, 'en');
  
  return [
    {
      text: `請${formattedTicketYue}到${counterNumber}號櫃台辦理業務`,
      lang: 'zh-HK' // 粤语使用香港中文（繁体字）
    },
    {
      text: `Please ${formattedTicketEn}, go to counter ${counterNumber}`,
      lang: 'en-US'
    }
  ];
};

// 加载可用语音列表
const loadVoices = () => {
  if (speechSynthesis) {
    availableVoices = speechSynthesis.getVoices();
  }
};

// 获取女声（优先选择女声，如果没有则使用默认语音）
const getFemaleVoice = (lang) => {
  if (!availableVoices || availableVoices.length === 0) {
    loadVoices();
  }
  
  let langVoices = [];
  
  // 对于粤语（zh-HK），只匹配 zh-HK 相关语音，不匹配 zh-CN
  if (lang === 'zh-HK') {
    // 只匹配 zh-HK 相关的语音，明确排除 zh-CN
    langVoices = availableVoices.filter(voice => {
      const voiceLang = voice.lang.toLowerCase();
      const voiceName = voice.name.toLowerCase();
      
      // 明确排除 zh-CN（普通话）
      if (voiceLang === 'zh-cn' || voiceLang.startsWith('zh-cn')) {
        return false;
      }
      
      // 精确匹配 zh-HK、yue-HK、yue
      if (voiceLang === 'zh-hk' || voiceLang === 'yue-hk' || voiceLang === 'yue') {
        return true;
      }
      
      // 通过语音名称判断粤语语音（但必须是 zh-HK 或 yue 相关，不能是 zh-CN）
      if ((voiceLang.startsWith('zh') && !voiceLang.startsWith('zh-cn')) || voiceLang.startsWith('yue')) {
        if (voiceName.includes('cantonese') ||
            voiceName.includes('yue') ||
            voiceName.includes('hong kong') ||
            voiceName.includes('hk') ||
            voiceName.includes('sin-ji') ||
            voiceName.includes('sinji') ||
            voiceName.includes('tracy')) { // 某些系统的粤语女声
          return true;
        }
      }
      
      return false;
    });
  } else {
    // 对于其他语言（如英文），使用原来的逻辑
    langVoices = availableVoices.filter(voice => {
      return voice.lang.startsWith(lang.split('-')[0]) || voice.lang === lang;
    });
  }
  
  if (langVoices.length === 0) {
    return null; // 如果没有匹配的语音，返回null使用默认语音
  }
  
  // 优先选择女声
  // 首先筛选出所有可能是女声的语音
  const possibleFemaleVoices = langVoices.filter(voice => {
    // 优先选择明确标记为女声的
    if (voice.gender === 'female') return true;
    
    const name = voice.name.toLowerCase();
    
    // 明确排除男声
    if (name.includes('male') || 
        name.includes('man') || 
        name.includes('david') ||
        name.includes('daniel') ||
        name.includes('mark') ||
        name.includes('thomas') ||
        name.includes('richard') ||
        name.includes('james') ||
        name.includes('george') ||
        name.includes('paul') ||
        name.includes('peter') ||
        name.includes('michael') ||
        name.includes('john')) {
      return false;
    }
    
    if (lang === 'zh-HK') {
      // 粤语女声关键词（明确的女声标识）
      return name.includes('female') || 
             name.includes('woman') || 
             name.includes('sin-ji') ||
             name.includes('sinji') ||
             name.includes('tracy') ||
             name.includes('karen') || // 某些系统的粤语女声也叫 karen
             name.includes('samantha'); // 某些系统的粤语女声
    } else {
      // 英文女声关键词（更全面的列表）
      return name.includes('female') || 
             name.includes('woman') || 
             name.includes('zira') || // Windows 英文女声
             name.includes('karen') || // macOS 英文女声
             name.includes('samantha') || // macOS 英文女声
             name.includes('susan') || // 某些系统的英文女声
             name.includes('hazel') || // Windows 英文女声
             name.includes('eva') || // 某些系统的英文女声
             name.includes('linda') || // 某些系统的英文女声
             name.includes('maria') || // 某些系统的英文女声
             name.includes('helen'); // 某些系统的英文女声
    }
  });
  
  // 如果找到了可能的女声，优先选择
  if (possibleFemaleVoices.length > 0) {
    // 首先尝试找到明确标记为女声的
    let explicitFemale = possibleFemaleVoices.find(voice => voice.gender === 'female');
    if (explicitFemale) {
      return explicitFemale;
    }
    
    // 进一步筛选：优先选择有明确女声标识的
    let femaleVoice = possibleFemaleVoices.find(voice => {
      const name = voice.name.toLowerCase();
      
      if (lang === 'zh-HK') {
        return name.includes('sin-ji') || 
               name.includes('sinji') || 
               name.includes('tracy') ||
               name.includes('female') ||
               name.includes('woman');
      } else {
        return name.includes('zira') || 
               name.includes('karen') || 
               name.includes('samantha') ||
               name.includes('female') ||
               name.includes('woman') ||
               name.includes('hazel') ||
               name.includes('susan');
      }
    });
    
    // 如果找到了明确的女声，返回它
    if (femaleVoice) {
      return femaleVoice;
    }
    
    // 否则返回第一个可能的女声（至少排除了男声）
    return possibleFemaleVoices[0];
  }
  
  // 如果没有找到可能的女声，尝试排除明显男声后选择
  // 但这次更严格，只选择那些看起来像女声的
  const nonMaleVoices = langVoices.filter(voice => {
    const name = voice.name.toLowerCase();
    // 排除所有已知的男声名称
    return !name.includes('male') && 
           !name.includes('man') && 
           !name.includes('david') &&
           !name.includes('daniel') &&
           !name.includes('mark') &&
           !name.includes('thomas') &&
           !name.includes('richard') &&
           !name.includes('james') &&
           !name.includes('george') &&
           !name.includes('paul') &&
           !name.includes('peter') &&
           !name.includes('michael') &&
           !name.includes('john');
  });
  
  // 如果排除了男声后还有选择，优先选择那些名称听起来像女声的
  if (nonMaleVoices.length > 0) {
    // 尝试找到名称中包含女声关键词的
    let likelyFemale = nonMaleVoices.find(voice => {
      const name = voice.name.toLowerCase();
      return name.includes('female') || 
             name.includes('woman') ||
             name.includes('zira') ||
             name.includes('karen') ||
             name.includes('samantha') ||
             name.includes('susan') ||
             name.includes('hazel') ||
             name.includes('eva') ||
             name.includes('linda') ||
             name.includes('maria') ||
             name.includes('helen');
    });
    
    if (likelyFemale) {
      return likelyFemale;
    }
    
    // 如果还是没有，返回第一个非男声（可能是中性或默认语音）
    return nonMaleVoices[0];
  }
  
  // 如果还是没有，使用第一个匹配的语音（最后的选择）
  return langVoices[0] || null;
};

// 预热语音引擎（第一次播放前）
const warmUpSpeechEngine = () => {
  return new Promise((resolve) => {
    if (!speechSynthesis || !isFirstPlay || isWarmingUp) {
      resolve();
      return;
    }
    
    isWarmingUp = true;
    
    // 创建一个非常短的预热语音（空格或静音）
    const warmUpUtterance = new SpeechSynthesisUtterance(' ');
    warmUpUtterance.volume = 0.01; // 几乎静音
    warmUpUtterance.rate = 10; // 最快速度，几乎瞬间完成
    
    warmUpUtterance.onend = () => {
      isWarmingUp = false;
      isFirstPlay = false;
      // 等待一小段时间确保引擎完全准备好
      setTimeout(() => {
        resolve();
      }, 100);
    };
    
    warmUpUtterance.onerror = () => {
      isWarmingUp = false;
      isFirstPlay = false;
      resolve(); // 即使预热失败也继续
    };
    
    speechSynthesis.speak(warmUpUtterance);
  });
};

// 播放单个语音
const playSingleVoice = (text, lang) => {
  return new Promise((resolve, reject) => {
    if (!speechSynthesis) {
      console.warn('语音合成不可用');
      reject(new Error('语音合成不可用'));
      return;
    }
    
    // 取消当前播放
    if (currentUtterance) {
      speechSynthesis.cancel();
    }
    
    // 创建新的语音对象
    const utterance = new SpeechSynthesisUtterance(text);
    
    // 设置语音参数
    utterance.lang = lang;
    utterance.rate = voiceRate.value; // 语速（从设置读取）
    utterance.pitch = 1.0; // 音调（固定为 1）
    utterance.volume = voiceVolume.value; // 音量（从设置读取）
    
    // 尝试选择女声
    const femaleVoice = getFemaleVoice(lang);
    if (femaleVoice) {
      utterance.voice = femaleVoice;
      const voiceName = femaleVoice.name.toLowerCase();
      const isLikelyFemale = femaleVoice.gender === 'female' || 
                            voiceName.includes('female') || 
                            voiceName.includes('woman') ||
                            voiceName.includes('sin-ji') ||
                            voiceName.includes('tracy') ||
                            voiceName.includes('zira') ||
                            voiceName.includes('karen') ||
                            voiceName.includes('samantha');
      
      // 如果是粤语，额外检查
      if (lang === 'zh-HK') {
        const voiceLang = femaleVoice.lang.toLowerCase();
        const isCantonese = voiceLang.includes('hk') || 
                           voiceLang.includes('yue') || 
                           voiceName.includes('cantonese') || 
                           voiceName.includes('sin-ji') ||
                           voiceName.includes('tracy');
        
        if (!isCantonese) {
          console.warn('警告: 可能使用的是普通话语音而非粤语语音。请检查系统是否安装了粤语语音包。');
        }
        
        if (!isLikelyFemale) {
          console.warn('警告: 可能使用的是男声而非女声。系统可能没有安装粤语女声。');
        }
      } else if (lang.startsWith('en')) {
        // 对于英文，检查是否是女声
        if (!isLikelyFemale) {
          console.warn('警告: 可能使用的是男声而非女声。系统可能没有安装英文女声。');
          // 输出所有可用的英文语音供调试
          const allEnglishVoices = availableVoices.filter(v => {
            const vLang = v.lang.toLowerCase();
            return vLang.startsWith('en');
          });
          if (allEnglishVoices.length > 0) {
            // console.log('系统中可用的英文语音:', allEnglishVoices.map(v => `${v.name} (${v.lang})${v.gender === 'female' ? ' [女声]' : v.gender === 'male' ? ' [男声]' : ''}`));
          }
        }
      }
    } else {
      if (lang === 'zh-HK') {
        console.warn('未找到粤语语音，可能系统未安装粤语语音包。');
      } else if (lang.startsWith('en')) {
        console.warn('未找到英文语音，可能系统未安装英文语音包。');
      }
    }
    
    // 播放完成回调
    utterance.onend = () => {
      currentUtterance = null;
      resolve();
    };
    
    // 播放错误回调
    utterance.onerror = (error) => {
      currentUtterance = null;
      console.error('语音播放错误:', error);
      reject(error);
    };
    
    currentUtterance = utterance;
    speechSynthesis.speak(utterance);
  });
};

// 播放多语言语音（依次播放粤语、英文）
const playVoice = async (texts) => {
  // 如果是第一次播放，先预热语音引擎（在整个语音播放前预热一次）
  if (isFirstPlay) {
    await warmUpSpeechEngine();
  }
  
  for (let i = 0; i < texts.length; i++) {
    const { text, lang } = texts[i];
    try {
      await playSingleVoice(text, lang);
      // 每种语言播放完成后等待一小段时间
      if (i < texts.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    } catch (error) {
      console.error(`播放${lang}语音失败:`, error);
      // 即使某种语言播放失败，也继续播放下一种语言
    }
  }
};

// 清理过期的去重记录
const cleanRecentPlayedTickets = () => {
  const now = Date.now();
  for (const [key, timestamp] of recentPlayedTickets.entries()) {
    if (now - timestamp > DEBOUNCE_TIME) {
      recentPlayedTickets.delete(key);
    }
  }
};

// 检查是否应该跳过播放（去重）- 只检查，不记录
const shouldSkipPlay = (ticketNumber, counterNumber) => {
  const key = `${ticketNumber}-${counterNumber}`;
  const now = Date.now();
  const lastPlayed = recentPlayedTickets.get(key);
  
  // 如果最近播放过，跳过（注意：这里只检查，不记录）
  if (lastPlayed && (now - lastPlayed) < DEBOUNCE_TIME) {
    return true;
  }
  
  // 定期清理过期记录（每10次调用清理一次，避免频繁清理）
  if (recentPlayedTickets.size > 20) {
    cleanRecentPlayedTickets();
  }
  
  return false;
};

// 处理语音播放队列（性能优化版本）
const processVoiceQueue = async () => {
  // 如果正在播放或队列为空，直接返回
  if (isPlaying.value || voiceQueue.value.length === 0) {
    return;
  }
  
  // 标记为正在播放，防止重复调用
  isPlaying.value = true;
  
  // 记录开始时间，用于性能监控
  const startTime = Date.now();
  let processedCount = 0;
  
  try {
    // 循环处理队列中的所有语音
    while (voiceQueue.value.length > 0) {
      const { ticketNumber, counterNumber } = voiceQueue.value.shift();
      processedCount++;
      
      // 再次去重检查（防止在队列等待期间重复添加）
      const key = `${ticketNumber}-${counterNumber}`;
      const now = Date.now();
      const lastPlayed = recentPlayedTickets.get(key);
      
      if (lastPlayed && (now - lastPlayed) < DEBOUNCE_TIME) {
        // console.log(`队列中跳过重复项: ${ticketNumber} 到 ${counterNumber}号柜台`);
        continue; // 跳过这个项，继续处理下一个
      }
      
      // 在真正播放前记录，避免重复播放
      recentPlayedTickets.set(key, now);
      
      const texts = generateVoiceTexts(ticketNumber, counterNumber);
      
      try {
        // 播放多语言语音（粤语、英文）
        await playVoice(texts);
        // 播放完成后等待一小段时间再播放下一个，避免语音重叠
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error('播放语音失败:', error);
        // 即使播放失败也继续处理队列，确保不会卡住
        // 播放失败时也等待一小段时间，避免连续失败导致CPU占用过高
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      // 定期清理去重记录（每处理10个项清理一次）
      if (processedCount % 10 === 0) {
        cleanRecentPlayedTickets();
      }
    }
    
    // 性能监控：记录处理时间
    const duration = Date.now() - startTime;
    if (processedCount > 0) {
      // console.log(`队列处理完成: 处理了 ${processedCount} 个语音项，耗时 ${duration}ms`);
    }
  } finally {
    // 确保无论成功或失败都重置播放状态
    isPlaying.value = false;
    
    // 如果队列中还有未处理的项，继续处理（可能是在播放期间新添加的）
    if (voiceQueue.value.length > 0) {
      // 使用 setTimeout 避免递归调用导致栈溢出
      setTimeout(() => {
        processVoiceQueue();
      }, 100);
    }
  }
};

// 添加语音到队列（性能优化版本）
const addToVoiceQueue = (ticketNumber, counterNumber) => {
  if (!isVoiceBroadcastHost.value) {
    return;
  }
  
  // 去重检查：如果最近播放过相同的票号，跳过
  if (shouldSkipPlay(ticketNumber, counterNumber)) {
    // console.log(`跳过重复播放: ${ticketNumber} 到 ${counterNumber}号柜台`);
    return;
  }
  
  // 队列长度限制：如果队列过长，移除最旧的项
  if (voiceQueue.value.length >= MAX_QUEUE_LENGTH) {
    const removed = voiceQueue.value.shift();
    console.warn(`队列已满，移除最旧的播放项: ${removed.ticketNumber} 到 ${removed.counterNumber}号柜台`);
  }
  
  // 添加到队列
  voiceQueue.value.push({ ticketNumber, counterNumber });
  
  // 如果当前没有在播放，则开始处理队列
  if (!isPlaying.value) {
    processVoiceQueue();
  }
};

onMounted(async () => {
  try {
    const response = await businessTypeService.getAll();
    businessTypes.value = response.data;
  } catch (error) {
    console.error('获取业务类型失败:', error);
  }
  
  // 获取自定义背景图片路径
  try {
    const imageResponse = await businessTypeService.getTicketBannerImage();
    if (imageResponse.data?.value) {
      bannerImage.value = imageResponse.data.value;
    }
  } catch (error) {
    console.error('获取取票页面背景图片路径失败:', error);
    // 使用默认值，不阻止页面加载
  }
  
  // 检查是否是语音播报主机
  await checkIsVoiceBroadcastHost();
  
  // 获取语音设置
  await fetchVoiceVolume();
  await fetchVoiceRate();
  
  // 启动时间更新定时器，每秒更新一次
  timerInterval.value = setInterval(() => {
    currentDate.value = new Date();
  }, 1000);
  
  // 延迟加载语音列表（某些浏览器需要等待）
  if (isVoiceBroadcastHost.value && speechSynthesis) {
    setTimeout(() => {
      loadVoices();
    }, 500);
  }
  
  // 监听语音播报事件
  socket.on('voice:announce', (data) => {
    const { ticketNumber, counterNumber } = data;
    if (ticketNumber && counterNumber) {
      addToVoiceQueue(ticketNumber, counterNumber);
    }
  });
  
  // 监听语音设置更新事件
  socket.on('voice:settingsUpdated', async (data) => {
    const { key } = data;
    if (key === 'voice_volume') {
      await fetchVoiceVolume();
    } else if (key === 'voice_rate') {
      await fetchVoiceRate();
    }
  });
});

// 组件卸载时清除定时器和事件监听器
onUnmounted(() => {
  if (timerInterval.value) {
    clearInterval(timerInterval.value);
  }
  
  // 停止语音播放
  if (speechSynthesis && currentUtterance) {
    speechSynthesis.cancel();
  }
  
  // 清理socket事件监听器
  socket.off('voice:announce');
  socket.off('voice:settingsUpdated');
});

// 切换到业务类型选择页面
const showBusinessTypes = () => {
  currentView.value = 'business-types';
};

// 返回首页
const returnToHome = () => {
  currentView.value = 'home';
};

// 处理子组件的取票事件
const handleGetTicket = async (selectedType) => {
  // 如果已经在加载中，不执行操作
  if (isLoading.value) return;
  
  isLoading.value = true;
  try {
    // 调用API获取票号
    const response = await ticketService.create(selectedType.id);
    const ticketInfo = response.data;
    
    // 更新子组件中的票号信息和等待人数
    if (businessTypeSelectorRef.value) {
      businessTypeSelectorRef.value.setTicketInfo({
        ticket_number: ticketInfo.ticket_number,
        print_status: ticketInfo.print_status,
        print_message: ticketInfo.print_message
      });
      businessTypeSelectorRef.value.setWaitingCount(ticketInfo.waiting_count);
    }
  } catch (error) {
    console.error('取票失败:', error);
    showErrorDialog.value = true;
    errorType.value = 'apiError';
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
  --base-font-size: 35px;  /* 调整为24寸显示器合适尺寸（原20px * 1.75） */
}
</style>

<style scoped>
/* 消除默认边距，防止滚动条出现 */
:root, body, html {
  margin: 0;
  padding: 0;
  overflow: hidden;
}

/* 主容器设置为纵向显示 */
.ticket-container {
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  height: 100vh; /* 使用固定高度而非最小高度 */
  max-height: 100vh; /* 限制最大高度 */
  background-color: #f5f7fa;
  font-family: 'Arial', sans-serif;
  box-sizing: border-box;
  overflow: hidden; /* 防止内容溢出 */
}

/* 内容包装器，实现垂直排列 */
.content-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding: 0;
  height: 100%; /* 使用100%高度填充容器 */
  width: 100%;
  box-sizing: border-box;
}

/* 首页样式 */
.home-view {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
}

/* 图片区域样式 - 占据更多空间 */
.image-section {
  flex: 2; /* 从1增加到2，使图片区域占据更多空间 */
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background-color: #000;
}

.banner-image {
  width: 100%;
  height: 100%;
  object-fit: cover; /* 确保图片覆盖整个区域且保持比例 */
}

/* 日期时间显示区域 */
.date-time-display {
  text-align: center;
  padding: 2.5vh 0; /* 增加内边距以适应大屏幕 */
  background-color: rgba(0, 0, 0, 0.6); /* 半透明黑色背景 */
  color: white;
  width: 100%;
  z-index: 10;
  position: relative;
}

.current-date {
  font-size: calc(var(--base-font-size) * 1.2);
  color: rgba(255, 255, 255, 0.9);
  margin-bottom: 5px;
}

.current-time {
  font-size: calc(var(--base-font-size) * 1.8);
  font-weight: 700;
  color: white;
}

/* 操作区域样式 - 占据下半部分 */
.action-section {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  background-color: #fff;
  padding: 35px; /* 增加内边距以适应大屏幕（原20px * 1.75） */
  box-sizing: border-box;
}

/* 选择业务按钮样式 */
.select-service-btn {
  background-color: #409EFF;
  color: white;
  border: none;
  border-radius: 26px; /* 增加圆角以适应大屏幕（原15px * 1.75） */
  padding: 5.25vh 10.5vw; /* 增加内边距以适应大屏幕（原3vh 6vw * 1.75） */
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 7px 26px rgba(64, 158, 255, 0.5); /* 增加阴影 */
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-size: calc(var(--base-font-size) * 1.5);
  min-height: 120px; /* 增加最小高度以适应大屏幕 */
}

.select-service-btn:hover {
  background-color: #66b1ff;
  transform: translateY(-5px);
  box-shadow: 0 8px 20px rgba(64, 158, 255, 0.6);
}

.select-service-btn:active {
  transform: translateY(0);
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.5);
}

.select-service-btn .chinese-text {
  margin-bottom: 0.5rem;
  font-size: calc(var(--base-font-size) * 1.8) !important;
  color: white;
}

.select-service-btn .english-text {
  font-size: calc(var(--base-font-size) * 1.2) !important;
  color: rgba(255, 255, 255, 0.9);
}

/* 首页组件的文本样式 */
.chinese-text {
  font-size: calc(var(--base-font-size) * 1) !important;
  color: #303133;
  font-weight: bold;
  margin-bottom: 0.5rem;
  line-height: 1.3;
}

.english-text {
  font-size: calc(var(--base-font-size) * 0.9) !important;
  color: #505050;
  line-height: 1.2;
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
  border-radius: 18px; /* 增加圆角（原10px * 1.75） */
  width: 90%;
  max-width: 700px; /* 增加最大宽度（原400px * 1.75） */
  padding: 35px; /* 增加内边距（原20px * 1.75） */
  box-shadow: 0 9px 26px rgba(0, 0, 0, 0.3); /* 增加阴影 */
  display: flex;
  flex-direction: column;
  align-items: center;
}

.dialog-icon {
  margin-bottom: 26px; /* 增加间距（原15px * 1.75） */
}

.error-icon {
  width: 105px; /* 增加尺寸（原60px * 1.75） */
  height: 105px;
  background-color: #f56c6c;
  border-radius: 50%;
  display: flex;
  justify-content: center;
  align-items: center;
  color: white;
  font-size: 63px; /* 增加字体（原36px * 1.75） */
  font-weight: bold;
}

.dialog-content {
  width: 100%;
  text-align: center;
  margin-bottom: 35px; /* 增加间距（原20px * 1.75） */
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
  border-radius: 9px; /* 增加圆角（原5px * 1.75） */
  padding: 18px 44px; /* 增加内边距（原10px 25px * 1.75） */
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  transition: all 0.3s;
  min-height: 80px; /* 增加最小高度 */
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

/* 响应式布局 - 大屏幕（24寸显示器） */
@media (min-width: 1400px) {
  :root {
    --base-font-size: 42px;  /* 大屏幕上使用更大字体（原24px * 1.75） */
  }
  
  .business-type-grid {
    max-width: 1750px; /* 增加最大宽度（原1000px * 1.75） */
  }
  
  .select-service-btn {
    min-height: 140px; /* 在大屏幕上进一步增加按钮高度 */
    padding: 6vh 12vw;
  }
  
  .date-time-display {
    padding: 3vh 0;
  }
  
  .action-section {
    padding: 40px;
  }
}

/* 响应式布局 - 平板电脑 */
@media (max-width: 1024px) {
  :root {
    --base-font-size: 18px;
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
    --base-font-size: 17px;
  }
  
  .business-type-grid {
    grid-template-columns: 1fr;
    width: 90%;
  }
  
  .header h1 {
    font-size: calc(var(--base-font-size) * 1.6);
  }
  
  .header h2 {
    font-size: calc(var(--base-font-size) * 1.2);
  }
  
  .business-type-btn {
    padding: 15px;
  }
  
  .get-ticket-section {
    flex-direction: column;
    gap: 15px;
  }
  
  .get-ticket-btn, .back-btn {
    width: 60%;
  }
}

/* 响应式布局 - 小型手机 */
@media (max-width: 480px) {
  :root {
    --base-font-size: 14px;
  }
  
  .header {
    margin-bottom: 2vh;
  }
  
  .header h1 {
    font-size: calc(var(--base-font-size) * 1.4);
  }
  
  .header h2 {
    font-size: calc(var(--base-font-size) * 1.1);
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
  
  .select-service-btn {
    padding: 2vh 8vw;
  }
  
  .select-service-btn .chinese-text {
    font-size: calc(var(--base-font-size) * 1.5) !important;
  }
  
  .select-service-btn .english-text {
    font-size: calc(var(--base-font-size) * 1) !important;
  }
}
</style>
