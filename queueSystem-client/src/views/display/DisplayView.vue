<template>
  <div class="display-container">
    <div class="header">
      <div class="header-image">
        <img :src="displayBannerImage" alt="Display Background" />
      </div>
    </div>
    
    <div class="content">
      <div 
        v-for="item in displayData" 
        :key="item.business_type_id"
        class="business-row"
      >
        <!-- 左侧1/3区域：业务信息 -->
        <div class="business-info">
          <div class="business-code">{{ item.code }}</div>
          <div class="business-name">{{ item.name }}</div>
          <div class="business-english-name">{{ item.english_name || '' }}</div>
        </div>
        
        <!-- 右侧2/3区域：最新服务号及对应柜台 -->
        <div class="service-info">
          <div v-if="item.last_ticket_no && item.counter_number" class="service-details">
            <!-- 第一行：标题 -->
            <div class="service-header">
              <div class="ticket-label">
                <div>現時籌號</div>
                <div>Current Queue No.</div>
              </div>
              <div class="arrow-placeholder"></div>
              <div class="counter-label">
                <div>櫃台</div>
                <div>Counter</div>
              </div>
            </div>
            <!-- 第二行：数据 -->
            <div class="service-data">
              <div class="ticket-number">{{ item.last_ticket_no }}</div>
              <div class="arrow">➜</div>
              <div class="counter-number">{{ item.counter_number }}</div>
            </div>
          </div>
          <div v-else class="no-service">
            <div class="no-service-text">
              <div>暫無服務記錄</div>
              <div>No Service Record</div>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 备注信息显示区域 -->
    <div v-if="displayRemarks" class="remarks-area">
      <div ref="remarksContentRef" class="remarks-content">{{ displayRemarks }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { businessTypeService, counterService } from '@/api';
import socket from '@/socket';

const displayData = ref([]);
const displayRemarks = ref('');
const remarksContentRef = ref(null);
const backgroundColor = ref('#1e7e34'); // 默认绿色
const displayBannerImage = ref('/pic/display_bg.png'); // 默认值，会在 onMounted 中从后端获取
let refreshInterval = null;
let resizeObserver = null;
let handleResize = null;

// 语音播放相关
const isDisplayDevice = ref(false);
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

// 获取显示数据
const fetchDisplayData = async () => {
  try {
    const response = await businessTypeService.getDisplayData();
    displayData.value = response.data || [];
  } catch (error) {
    console.error('获取显示数据失败:', error);
    displayData.value = [];
  }
};

// 获取显示屏备注
const fetchDisplayRemarks = async () => {
  try {
    const response = await businessTypeService.getDisplayRemarks();
    displayRemarks.value = response.data?.value || '';
    // 等待DOM更新后调整字体大小
    await nextTick();
    adjustRemarksFontSize();
  } catch (error) {
    console.error('获取显示屏备注失败:', error);
    displayRemarks.value = '';
  }
};

// 获取语音音量设置（后端已处理换算）
const fetchVoiceVolume = async () => {
  try {
    const response = await businessTypeService.getVoiceVolume();
    // 后端已返回换算后的值（0 到 1）
    voiceVolume.value = parseFloat(response.data?.value) || 1.0;
    // 确保值在有效范围内（双重保险）
    if (voiceVolume.value < 0) voiceVolume.value = 0;
    if (voiceVolume.value > 1) voiceVolume.value = 1;
    // console.log('语音音量设置:', voiceVolume.value);
  } catch (error) {
    // console.error('获取语音音量失败:', error);
    voiceVolume.value = 1.0; // 使用默认值
  }
};

// 获取语音语速设置（后端已处理换算）
const fetchVoiceRate = async () => {
  try {
    const response = await businessTypeService.getVoiceRate();
    // 后端已返回换算后的值（0.1 到 10）
    voiceRate.value = parseFloat(response.data?.value) || 1.0;
    // 确保值在有效范围内（双重保险）
    if (voiceRate.value < 0.1) voiceRate.value = 0.1;
    if (voiceRate.value > 10) voiceRate.value = 10;
    // console.log('语音语速设置:', voiceRate.value);
  } catch (error) {
    // console.error('获取语音语速失败:', error);
    voiceRate.value = 1.0; // 使用默认值
  }
};

// 检查当前设备是否是显示设备
const checkIsDisplayDevice = async () => {
  try {
    // 获取 voice_broadcast_host_ip 设置
    const voiceHostIPResponse = await businessTypeService.getVoiceBroadcastHostIP();
    const voiceBroadcastHostIP = voiceHostIPResponse.data?.value || '';
    
    if (!voiceBroadcastHostIP) {
      // console.log('未配置 voice_broadcast_host_ip，不启用语音播放');
      isDisplayDevice.value = false;
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
    isDisplayDevice.value = clientIP === voiceBroadcastHostIP;
    
    if (isDisplayDevice.value) {
      // console.log('当前设备是语音播报主机，已启用语音播放功能');
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
    } else {
      // console.log(`当前设备IP(${clientIP})不是语音播报主机IP(${voiceBroadcastHostIP})，不启用语音播放`);
    }
  } catch (error) {
    console.error('检查显示设备失败:', error);
    isDisplayDevice.value = false;
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
    // console.log('已加载语音列表:', availableVoices.length, '个语音');
    
    // 输出所有中文相关语音，方便调试
    const chineseVoices = availableVoices.filter(v => 
      v.lang.toLowerCase().startsWith('zh') || 
      v.lang.toLowerCase().startsWith('yue')
    );
    if (chineseVoices.length > 0) {
      // console.log('可用的中文/粤语语音:', chineseVoices.map(v => `${v.name} (${v.lang})`));
    }
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
        name.includes('james')) {
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
      // 英文女声关键词
      return name.includes('female') || 
             name.includes('woman') || 
             name.includes('zira') || // Windows 英文女声
             name.includes('karen') || // macOS 英文女声
             name.includes('samantha') || // macOS 英文女声
             name.includes('susan') || // 某些系统的英文女声
             name.includes('hazel'); // Windows 英文女声
    }
  });
  
  // 如果找到了可能的女声，优先选择
  if (possibleFemaleVoices.length > 0) {
    // 进一步筛选：优先选择有明确女声标识的
    let femaleVoice = possibleFemaleVoices.find(voice => {
      if (voice.gender === 'female') return true;
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
               name.includes('woman');
      }
    });
    
    // 如果找到了明确的女声，返回它
    if (femaleVoice) {
      return femaleVoice;
    }
    
    // 否则返回第一个可能的女声
    return possibleFemaleVoices[0];
  }
  
  // 如果没有找到可能的女声，尝试排除明显男声后选择
  const nonMaleVoices = langVoices.filter(voice => {
    const name = voice.name.toLowerCase();
    return !name.includes('male') && 
           !name.includes('man') && 
           !name.includes('david') &&
           !name.includes('daniel') &&
           !name.includes('mark') &&
           !name.includes('thomas') &&
           !name.includes('richard') &&
           !name.includes('james');
  });
  
  if (nonMaleVoices.length > 0) {
    return nonMaleVoices[0];
  }
  
  // 如果还是没有，使用第一个匹配的语音
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
      
      // console.log(`使用语音: ${femaleVoice.name} (${femaleVoice.lang})${isLikelyFemale ? ' [女声]' : ' [可能不是女声]'}`);
      
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
          // 输出所有可用的粤语语音供调试（排除 zh-CN）
          const allCantoneseVoices = availableVoices.filter(v => {
            const vLang = v.lang.toLowerCase();
            const vName = v.name.toLowerCase();
            // 明确排除 zh-CN
            if (vLang === 'zh-cn' || vLang.startsWith('zh-cn')) {
              return false;
            }
            return (vLang.includes('hk') || vLang.includes('yue') || 
                   vName.includes('cantonese') || vName.includes('sin-ji') || vName.includes('tracy')) &&
                   (vLang.startsWith('zh') || vLang.startsWith('yue'));
          });
          if (allCantoneseVoices.length > 0) {
            // console.log('系统中可用的粤语语音:', allCantoneseVoices.map(v => `${v.name} (${v.lang})`));
          }
        }
      }
    } else {
      // console.log(`未找到匹配的语音，使用默认语音 (${lang})`);
      if (lang === 'zh-HK') {
        console.warn('未找到粤语语音，可能系统未安装粤语语音包。');
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
        console.log(`队列中跳过重复项: ${ticketNumber} 到 ${counterNumber}号柜台`);
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
      console.log(`队列处理完成: 处理了 ${processedCount} 个语音项，耗时 ${duration}ms`);
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
  if (!isDisplayDevice.value) {
    return;
  }
  
  // 去重检查：如果最近播放过相同的票号，跳过
  if (shouldSkipPlay(ticketNumber, counterNumber)) {
    console.log(`跳过重复播放: ${ticketNumber} 到 ${counterNumber}号柜台`);
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

// 从图片中提取背景色
const extractBackgroundColor = () => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = displayBannerImage.value;
    
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        
        // 从图片的四个角和中心区域采样颜色
        const samplePoints = [
          { x: 0, y: 0 }, // 左上角
          { x: img.width - 1, y: 0 }, // 右上角
          { x: 0, y: img.height - 1 }, // 左下角
          { x: img.width - 1, y: img.height - 1 }, // 右下角
          { x: Math.floor(img.width / 2), y: Math.floor(img.height / 2) } // 中心
        ];
        
        const colors = samplePoints.map(point => {
          const imageData = ctx.getImageData(point.x, point.y, 1, 1);
          const [r, g, b] = imageData.data;
          return { r, g, b };
        });
        
        // 计算平均颜色
        const avgColor = {
          r: Math.round(colors.reduce((sum, c) => sum + c.r, 0) / colors.length),
          g: Math.round(colors.reduce((sum, c) => sum + c.g, 0) / colors.length),
          b: Math.round(colors.reduce((sum, c) => sum + c.b, 0) / colors.length)
        };
        
        // 转换为十六进制
        const hexColor = `#${avgColor.r.toString(16).padStart(2, '0')}${avgColor.g.toString(16).padStart(2, '0')}${avgColor.b.toString(16).padStart(2, '0')}`;
        resolve(hexColor);
      } catch (error) {
        console.error('提取背景色失败:', error);
        resolve('#1e7e34'); // 失败时使用默认颜色
      }
    };
    
    img.onerror = () => {
      console.error('加载图片失败');
      resolve('#1e7e34'); // 失败时使用默认颜色
    };
  });
};

// 动态调整备注文字大小
const adjustRemarksFontSize = () => {
  if (!remarksContentRef.value) return;
  
  const element = remarksContentRef.value;
  const container = element.parentElement;
  
  if (!container) return;
  
  // 获取容器尺寸（减去padding）
  const containerHeight = container.clientHeight - 40; // 上下各20px padding
  const containerWidth = container.clientWidth - 40; // 左右各20px padding
  
  // 检查是否超出容器（允许一些容差，避免因为像素舍入导致的误判）
  const checkFit = () => {
    const scrollHeight = element.scrollHeight;
    const scrollWidth = element.scrollWidth;
    
    // 允许2px的容差，避免因为浏览器渲染精度问题导致的误判
    // 主要检查scrollHeight和scrollWidth，因为这是实际内容的大小
    return scrollHeight <= containerHeight + 2 && 
           scrollWidth <= containerWidth + 2;
  };
  
  // 使用更大的字体范围，充分利用空间
  // 根据容器高度动态计算最大字体
  // 考虑line-height 1.4，每行高度约为 fontSize * 1.4
  // 允许最多3行，所以最大字体 = 容器高度 / (3 * 1.4) ≈ 容器高度 / 4.2
  const maxFontSizeByHeight = Math.floor(containerHeight / 4.2);
  const maxFontSizeByWidth = Math.floor(containerWidth / 8); // 更宽松的宽度计算
  const calculatedMaxFontSize = Math.min(maxFontSizeByHeight, maxFontSizeByWidth, 72); // 最大不超过72px
  
  // 二分查找合适的字体大小
  let minFontSize = 6;
  let maxFontSize = Math.max(24, calculatedMaxFontSize); // 至少从24px开始，但可以更大
  let bestSize = minFontSize;
  let fontSize;
  
  // 先尝试从较大的字体开始
  while (minFontSize <= maxFontSize) {
    fontSize = Math.floor((minFontSize + maxFontSize) / 2);
    element.style.fontSize = `${fontSize}px`;
    
    // 等待浏览器重新渲染
    void element.offsetHeight;
    
    if (checkFit()) {
      bestSize = fontSize;
      minFontSize = fontSize + 1;
    } else {
      maxFontSize = fontSize - 1;
    }
  }
  
  // 应用最佳字体大小
  element.style.fontSize = `${bestSize}px`;
};

// 监听备注内容变化
watch(displayRemarks, async (newVal) => {
  if (newVal) {
    await nextTick();
    // 如果ResizeObserver还没有初始化，现在初始化
    if (!resizeObserver && remarksContentRef.value && remarksContentRef.value.parentElement) {
      resizeObserver = new ResizeObserver(() => {
        adjustRemarksFontSize();
      });
      resizeObserver.observe(remarksContentRef.value.parentElement);
    }
    adjustRemarksFontSize();
  }
});

// 初始化
onMounted(async () => {
  // 获取自定义背景图片路径
  try {
    const imageResponse = await businessTypeService.getDisplayBannerImage();
    if (imageResponse.data?.value) {
      displayBannerImage.value = imageResponse.data.value;
    }
  } catch (error) {
    console.error('获取显示屏背景图片路径失败:', error);
    // 使用默认值，不阻止页面加载
  }
  
  // 提取图片背景色并应用到页面
  const bgColor = await extractBackgroundColor();
  backgroundColor.value = bgColor;
  
  // 检查是否是显示设备
  await checkIsDisplayDevice();
  
  // 立即获取一次数据
  fetchDisplayData();
  fetchDisplayRemarks();
  
  // 获取语音设置
  await fetchVoiceVolume();
  await fetchVoiceRate();
  
  // 每5秒刷新一次数据
  refreshInterval = setInterval(() => {
    fetchDisplayData();
    fetchDisplayRemarks();
  }, 5000);
  
  // 监听叫号事件，刷新显示数据
  socket.on('ticket:nextCalled', async () => {
    // console.log('收到叫号事件，刷新显示数据');
    // 立即刷新显示数据
    await fetchDisplayData();
  });
  
  // 监听语音播报事件
  socket.on('voice:announce', (data) => {
    const { ticketNumber, counterNumber } = data;
    if (ticketNumber && counterNumber) {
      // console.log('收到语音播报事件:', { ticketNumber, counterNumber });
      addToVoiceQueue(ticketNumber, counterNumber);
    }
  });
  
  // 监听语音设置更新事件
  socket.on('voice:settingsUpdated', async (data) => {
    const { key } = data;
    // console.log('收到语音设置更新通知:', key);
    // 根据更新的设置项重新获取对应的设置
    if (key === 'voice_volume') {
      await fetchVoiceVolume();
      // console.log('已刷新语音音量设置');
    } else if (key === 'voice_rate') {
      await fetchVoiceRate();
      // console.log('已刷新语音语速设置');
    }
  });
  
  // 监听窗口大小变化
  handleResize = () => {
    adjustRemarksFontSize();
  };
  window.addEventListener('resize', handleResize);
  
  // 初始化ResizeObserver（延迟执行，确保DOM已渲染）
  nextTick(() => {
    if (remarksContentRef.value && remarksContentRef.value.parentElement) {
      resizeObserver = new ResizeObserver(() => {
        adjustRemarksFontSize();
      });
      resizeObserver.observe(remarksContentRef.value.parentElement);
    }
  });
  
  // 延迟加载语音列表（某些浏览器需要等待）
  if (isDisplayDevice.value && speechSynthesis) {
    setTimeout(() => {
      loadVoices();
    }, 500);
  }
  
});

// 清理定时器和事件监听器
onUnmounted(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
  // 移除 socket 事件监听器
  socket.off('ticket:nextCalled');
  socket.off('voice:announce');
  socket.off('voice:settingsUpdated');
  // 清理窗口resize监听器
  if (handleResize) {
    window.removeEventListener('resize', handleResize);
  }
  // 清理ResizeObserver
  if (resizeObserver) {
    resizeObserver.disconnect();
  }
  // 停止语音播放
  if (speechSynthesis && currentUtterance) {
    speechSynthesis.cancel();
  }
  // 清空队列
  voiceQueue.value = [];
  isPlaying.value = false;
  // 清空去重记录
  recentPlayedTickets.clear();
});
</script>

<style scoped>
.display-container {
  background-color: v-bind(backgroundColor);
  height: 100vh;
  padding: 2px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: background-color 0.3s ease;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2px;
  padding: 0;
  flex-shrink: 0;
  width: 100%;
  height: calc(100vh / 13 + 20px);
  box-sizing: border-box;
}

.header-image {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  overflow: hidden;
  min-width: 0;
}

.header-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center center;
  flex-shrink: 1;
}

.content {
  display: flex;
  flex-direction: column;
  gap: clamp(5px, 1vh, 10px);
  flex: 1;
  overflow: hidden;
  min-height: 0;
}

.business-row {
  display: flex;
  background-color: white;
  border-radius: 8px;
  padding: clamp(8px, 1.5vh, 15px);
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  min-height: 0;
  flex: 1 1 0;
  align-items: center;
}

/* 左侧1/3区域：业务信息 */
.business-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding-right: 15px;
  border-right: 2px solid #e4e7ed;
}

.business-code {
  font-size: clamp(60px, 12vw, 140px);
  font-weight: bold;
  color: #1e7e34;
  margin-bottom: -10px;
  line-height: 0.8;
  text-align: center;
  width: 100%;
  padding: 0;
  display: block;
}

.business-name {
  font-size: clamp(14px, 2vw, 24px);
  color: #303133;
  margin-top: 6px;
  margin-bottom: 2px;
  font-weight: 500;
  text-align: center;
  line-height: 1.2;
}

.business-english-name {
  font-size: clamp(12px, 1.5vw, 18px);
  color: #909399;
  font-style: italic;
  text-align: center;
  line-height: 1.2;
  margin-top: 0;
}

/* 右侧2/3区域：服务信息 */
.service-info {
  flex: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  padding-left: 15px;
}

.service-details {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* 第一行：标题 */
.service-header {
  display: flex;
  align-items: center;
}

.ticket-label {
  font-size: clamp(12px, 1.8vw, 20px);
  color: #606266;
  font-weight: 500;
  flex: 1;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.2;
}

.counter-label {
  font-size: clamp(12px, 1.8vw, 20px);
  color: #606266;
  font-weight: 500;
  flex: 1;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.2;
}

/* 箭头占位（标题行） */
.arrow-placeholder {
  flex: 0 0 auto;
  width: clamp(36px, 6vw, 72px);
  margin: 0 10px;
  text-align: center;
}

/* 第二行：数据 */
.service-data {
  display: flex;
  align-items: center;
}

.ticket-number {
  font-size: clamp(36px, 6vw, 72px);
  font-weight: bold;
  color: #303133;
  line-height: 1.2;
  flex: 1;
  text-align: center;
}

.arrow {
  font-size: clamp(36px, 6vw, 72px);
  color: #1e7e34;
  font-weight: bold;
  flex: 0 0 auto;
  width: clamp(36px, 6vw, 72px);
  margin: 0 10px;
  text-align: center;
  text-shadow: 0 2px 4px rgba(30, 126, 52, 0.3);
  filter: drop-shadow(0 2px 4px rgba(30, 126, 52, 0.2));
}

.counter-number {
  font-size: clamp(36px, 6vw, 72px);
  font-weight: bold;
  color: #303133;
  line-height: 1.2;
  flex: 1;
  text-align: center;
}

.no-service {
  display: flex;
  align-items: center;
  justify-content: center;
}

.no-service-text {
  font-size: clamp(14px, 2vw, 24px);
  color: #c0c4cc;
  font-style: italic;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

/* 备注信息显示区域 */
.remarks-area {
  margin-top: 0px;
  padding: 20px;
  flex-shrink: 0;
  height: calc(100vh / 13 + 20px);
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

.remarks-content {
  font-size: 24px; /* 初始字体大小，会被JavaScript动态调整 */
  color: #000000;
  text-align: center;
  line-height: 1.4;
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow: hidden;
  max-width: 100%;
  max-height: 100%;
  width: 100%;
  box-sizing: border-box;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .business-code {
    font-size: 90px;
  }
  
  .business-name {
    font-size: 20px;
  }
  
  .business-english-name {
    font-size: 16px;
  }
  
  .ticket-number {
    font-size: 54px;
  }
  
  .counter-number {
    font-size: 54px;
  }
  
  .arrow {
    font-size: 54px;
    width: 54px;
  }
  
  .ticket-label,
  .counter-label {
    font-size: 16px;
  }
}
</style>
