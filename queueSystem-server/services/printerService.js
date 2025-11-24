/**
 * 打印机服务模块
 * 使用 ffi-napi 调用打印机 DLL (CsnPrinterLibs.dll)
 */

const path = require('path');
const fs = require('fs');
const printerLogger = require('../utils/printerLogger');

// 延迟加载 loadPrinterModules，避免在模块加载时失败
let loadPrinterModules, getPrinterDllPath;
try {
  const printerModulesLoader = require('../utils/loadPrinterModules');
  loadPrinterModules = printerModulesLoader.loadPrinterModules;
  getPrinterDllPath = printerModulesLoader.getPrinterDllPath;
  console.log('✓ loadPrinterModules 工具函数加载成功');
} catch (error) {
  console.error('❌ 加载 loadPrinterModules 工具函数失败:');
  console.error('  错误信息:', error.message);
  console.error('  错误堆栈:', error.stack);
  // 设置空函数，避免后续调用失败
  loadPrinterModules = () => null;
  getPrinterDllPath = () => '';
}

let ffi = null;
let ref = null;
let printerDll = null;
let printerHandle = null; // 打印机端口句柄

/**
 * 加载打印机配置文件
 * 优先级：环境变量 > 配置文件 > 默认值
 * @returns {Object} 配置对象
 */
function loadPrinterConfig() {
  // 默认配置
  const defaultConfig = {
    portType: 'USB',
    portName: 'USB001',
    tcpPort: 9100,
    baudrate: 9600,
    flowcontrol: 0,
    parity: 0,
    databits: 8,
    stopbits: 0,
    enabled: true
  };

  // 尝试从配置文件读取
  let fileConfig = {};
  const configPaths = [
    // 打包环境：可执行文件同目录下的配置文件
    path.join(process.cwd(), 'printer.config.json'),
    // 开发环境：项目根目录下的配置文件
    path.join(__dirname, '../printer.config.json'),
    // 备用路径
    path.join(__dirname, '../../printer.config.json')
  ];

  for (const configPath of configPaths) {
    try {
      if (fs.existsSync(configPath)) {
        const configContent = fs.readFileSync(configPath, 'utf8');
        fileConfig = JSON.parse(configContent);
        console.log(`✓ 已加载打印机配置文件: ${configPath}`);
        break;
      }
    } catch (error) {
      // 如果某个路径读取失败，继续尝试下一个
      console.warn(`⚠ 读取配置文件失败 ${configPath}:`, error.message);
    }
  }

  // 合并配置：环境变量 > 配置文件 > 默认值
  const config = {
    portType: process.env.PRINTER_PORT_TYPE || fileConfig.portType || defaultConfig.portType,
    portName: process.env.PRINTER_PORT_NAME || fileConfig.portName || defaultConfig.portName,
    tcpPort: process.env.PRINTER_TCP_PORT 
      ? parseInt(process.env.PRINTER_TCP_PORT) 
      : (fileConfig.tcpPort !== undefined ? fileConfig.tcpPort : defaultConfig.tcpPort),
    baudrate: process.env.PRINTER_BAUDRATE 
      ? parseInt(process.env.PRINTER_BAUDRATE) 
      : (fileConfig.baudrate !== undefined ? fileConfig.baudrate : defaultConfig.baudrate),
    flowcontrol: process.env.PRINTER_FLOWCONTROL 
      ? parseInt(process.env.PRINTER_FLOWCONTROL) 
      : (fileConfig.flowcontrol !== undefined ? fileConfig.flowcontrol : defaultConfig.flowcontrol),
    parity: process.env.PRINTER_PARITY 
      ? parseInt(process.env.PRINTER_PARITY) 
      : (fileConfig.parity !== undefined ? fileConfig.parity : defaultConfig.parity),
    databits: process.env.PRINTER_DATABITS 
      ? parseInt(process.env.PRINTER_DATABITS) 
      : (fileConfig.databits !== undefined ? fileConfig.databits : defaultConfig.databits),
    stopbits: process.env.PRINTER_STOPBITS 
      ? parseInt(process.env.PRINTER_STOPBITS) 
      : (fileConfig.stopbits !== undefined ? fileConfig.stopbits : defaultConfig.stopbits),
    enabled: process.env.PRINTER_ENABLED !== undefined 
      ? process.env.PRINTER_ENABLED !== 'false' 
      : (fileConfig.enabled !== undefined ? fileConfig.enabled : defaultConfig.enabled)
  };

  // 显示配置来源信息
  const configSource = Object.keys(fileConfig).length > 0 ? '配置文件' : '默认值';
  const hasEnvVars = Object.keys(process.env).some(key => key.startsWith('PRINTER_'));
  if (hasEnvVars) {
    console.log('ℹ️  打印机配置来源: 环境变量（覆盖配置文件和默认值）');
  } else if (configSource === '配置文件') {
    console.log('ℹ️  打印机配置来源: 配置文件');
  } else {
    console.log('ℹ️  打印机配置来源: 默认值');
  }

  return config;
}

// 加载打印机配置
const PRINTER_CONFIG = loadPrinterConfig();

// 尝试加载 ffi-napi 和 DLL
try {
  if (PRINTER_CONFIG.enabled) {
    console.log('========================================');
    console.log('开始初始化打印机服务...');
    console.log('========================================');
    
    // 使用工具函数动态加载原生模块（支持 pkg 打包环境）
    console.log('调用 loadPrinterModules()...');
    let printerModules;
    try {
      printerModules = loadPrinterModules();
      console.log('loadPrinterModules() 执行完成');
    } catch (loadError) {
      console.error('❌ loadPrinterModules() 执行时发生异常:');
      console.error('  错误信息:', loadError.message);
      console.error('  错误堆栈:', loadError.stack);
      throw loadError;
    }
    
    if (!printerModules) {
      console.error('❌ loadPrinterModules() 返回 null');
      throw new Error('loadPrinterModules() 返回 null，无法加载打印机原生模块');
    }
    
    console.log('✓ loadPrinterModules() 返回了模块对象');
    
    console.log('已加载的模块:', Object.keys(printerModules));
    
    if (!printerModules['ffi-napi']) {
      throw new Error('无法加载 ffi-napi 模块');
    }
    
    if (!printerModules['ref-napi']) {
      throw new Error('无法加载 ref-napi 模块');
    }
    
    ffi = printerModules['ffi-napi'];
    ref = printerModules['ref-napi'];
    console.log('✓ ffi-napi 和 ref-napi 加载成功');
    
    // 使用工具函数获取 DLL 路径（支持 pkg 打包环境）
    const DLL_PATH = getPrinterDllPath();
    console.log(`DLL 路径: ${DLL_PATH}`);
    
    // 验证 DLL 文件是否存在
    if (!fs.existsSync(DLL_PATH)) {
      throw new Error(`打印机 DLL 文件不存在: ${DLL_PATH}`);
    }
    console.log('✓ DLL 文件存在');
    
    // 定义 DLL 函数签名（根据 PrinterLibs.h）
    printerDll = ffi.Library(DLL_PATH, {
      // 端口操作函数
      'Port_OpenCOMIO': ['pointer', ['string', 'uint32', 'int', 'int', 'int', 'int']],
      'Port_OpenUSBIO': ['pointer', ['string']],
      'Port_OpenLPTIO': ['pointer', ['string']],
      'Port_OpenPRNIO': ['pointer', ['string']],
      'Port_OpenTCPIO': ['pointer', ['string', 'ushort']],
      'Port_SetPort': ['bool', ['pointer']],
      'Port_ClosePort': ['void', ['pointer']],
      
      // 打印函数
      'Pos_Reset': ['bool', []],
      'Pos_FeedLine': ['bool', []],
      'Pos_Feed_N_Line': ['bool', ['int']],
      'Pos_Align': ['bool', ['int']],
      'Pos_Text': ['bool', ['string', 'int', 'int', 'int', 'int', 'int', 'int']],
      'Pos_FullCutPaper': ['bool', []],
      'Pos_HalfCutPaper': ['bool', []],
      
      // 查询函数
      'Pos_QueryPrinterErr': ['int', ['ulong']]
    });
    
    console.log('✓ 打印机 DLL 函数绑定成功');
    printerLogger.info('打印机 DLL 加载成功', { dllPath: DLL_PATH, config: PRINTER_CONFIG });
  } else {
    printerLogger.info('打印机功能已禁用（PRINTER_ENABLED=false）');
  }
} catch (error) {
  console.error('❌ 打印机 DLL 加载失败:');
  console.error('  错误信息:', error.message);
  if (error.stack) {
    console.error('  错误堆栈:', error.stack);
  }
  
  printerLogger.warn('打印机 DLL 加载失败，将使用模拟模式', { 
    error: error.message,
    stack: error.stack,
    hint: '请确保已安装依赖: npm install ffi-napi ref-napi ref-struct-napi ref-array-napi。如果是打包环境，请确保这些模块已复制到可执行文件同目录下的 node_modules 目录中。'
  });
  printerDll = null;
  ffi = null;
  ref = null;
}

/**
 * 打开打印机端口
 * @returns {Promise<boolean>} 是否成功
 */
async function openPort() {
  if (!printerDll) {
    return false;
  }
  
  // 如果已经打开，先关闭
  if (printerHandle) {
    await closePort();
  }
  
  try {
    let handle = null;
    
    switch (PRINTER_CONFIG.portType.toUpperCase()) {
      case 'COM':
        handle = printerDll.Port_OpenCOMIO(
          PRINTER_CONFIG.portName,
          PRINTER_CONFIG.baudrate,
          PRINTER_CONFIG.flowcontrol,
          PRINTER_CONFIG.parity,
          PRINTER_CONFIG.databits,
          PRINTER_CONFIG.stopbits
        );
        break;
        
      case 'USB':
        handle = printerDll.Port_OpenUSBIO(PRINTER_CONFIG.portName);
        break;
        
      case 'LPT':
        handle = printerDll.Port_OpenLPTIO(PRINTER_CONFIG.portName);
        break;
        
      case 'PRN':
        handle = printerDll.Port_OpenPRNIO(PRINTER_CONFIG.portName);
        break;
        
      case 'TCP':
        handle = printerDll.Port_OpenTCPIO(PRINTER_CONFIG.portName, PRINTER_CONFIG.tcpPort);
        break;
        
      default:
        throw new Error(`不支持的端口类型: ${PRINTER_CONFIG.portType}`);
    }
    
    // 检查句柄是否有效（非空指针）
    if (handle.isNull()) {
      throw new Error(`无法打开端口 ${PRINTER_CONFIG.portName}，请检查打印机连接`);
    }
    
    // 设置端口
    const setResult = printerDll.Port_SetPort(handle);
    if (!setResult) {
      printerDll.Port_ClosePort(handle);
      throw new Error('设置端口失败');
    }
    
    printerHandle = handle;
    printerLogger.info(`打印机端口打开成功: ${PRINTER_CONFIG.portType}:${PRINTER_CONFIG.portName}`);
    return true;
    
  } catch (error) {
    printerLogger.error('打开打印机端口失败', { 
      error: error.message,
      stack: error.stack,
      portType: PRINTER_CONFIG.portType,
      portName: PRINTER_CONFIG.portName
    });
    printerHandle = null;
    return false;
  }
}

/**
 * 关闭打印机端口
 * @returns {Promise<boolean>} 是否成功
 */
async function closePort() {
  if (!printerDll || !printerHandle) {
    return false;
  }
  
  try {
    printerDll.Port_ClosePort(printerHandle);
    printerHandle = null;
    return true;
  } catch (error) {
    printerLogger.error('关闭打印机端口失败', { 
      error: error.message,
      stack: error.stack
    });
    printerHandle = null;
    return false;
  }
}

/**
 * 初始化打印机
 * @returns {Promise<boolean>} 是否成功
 */
async function initPrinter() {
  if (!printerDll) {
    printerLogger.warn('打印机 DLL 未加载，跳过初始化');
    return false;
  }
  
  try {
    // 打开端口
    const opened = await openPort();
    if (!opened) {
      return false;
    }
    
    // 重置打印机
    const resetResult = printerDll.Pos_Reset();
    if (!resetResult) {
      printerLogger.warn('打印机重置失败，但继续执行');
    }
    
    printerLogger.info('打印机初始化成功');
    return true;
  } catch (error) {
    printerLogger.error('初始化打印机失败', { 
      error: error.message,
      stack: error.stack
    });
    return false;
  }
}

/**
 * 打印票号
 * @param {Object} ticketData - 票号数据
 * @param {string} ticketData.ticket_number - 票号
 * @param {string} ticketData.business_type_name - 业务类型名称
 * @param {string} ticketData.business_type_english_name - 业务类型英文名称（可选）
 * @param {number} ticketData.waiting_count - 等待人数
 * @returns {Promise<{success: boolean, message: string}>} 打印结果
 */
async function printTicket(ticketData) {
  const { ticket_number, business_type_name, business_type_english_name, waiting_count } = ticketData;
  
  // 如果 DLL 未加载，返回模拟结果
  if (!printerDll) {
    printerLogger.debug('模拟打印（DLL未加载）', {
      ticket_number,
      business_type_name,
      business_type_english_name,
      waiting_count
    });
    return {
      success: true,
      message: '模拟打印成功（DLL未加载）'
    };
  }
  
  try {
    // 确保端口已打开
    if (!printerHandle) {
      const opened = await openPort();
      if (!opened) {
        return {
          success: false,
          message: '无法打开打印机端口，请检查打印机连接'
        };
      }
    }
    
    // 准备打印内容（参考 BusinessTypeSelector.vue 弹窗格式）
    const date = new Date();
    const dateStr = date.toLocaleDateString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const timeStr = date.toLocaleTimeString('zh-TW', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    
    // 打印内容布局（与取票成功弹窗一致）
    // 注意：Pos_Text 使用 wstring（宽字符），ffi-napi 会自动转换
    // 参数：文本, 编码(0=GBK), 位置(-2=居中), 宽度倍数, 高度倍数, 字体类型(0=12*24), 字体样式(0=正常)
    
    // 1. 居中对齐
    printerDll.Pos_Align(1); // 1 = 居中对齐
    
    // 2. 打印标题（繁体中文 + 英文，参考弹窗）
    // 繁体中文：您已成功獲取【業務類型】服務號碼
    const titleZh = `您已成功獲取【${business_type_name}】服務號碼`;
    printerDll.Pos_Text(titleZh, 0, -2, 1, 1, 0, 0x08); // 加粗
    printerDll.Pos_FeedLine();
    
    // 英文：You have successfully obtained a 【Service Type】 service number
    const titleEn = business_type_english_name 
      ? `You have successfully obtained a 【${business_type_english_name}】 service number`
      : `You have successfully obtained a service number`;
    printerDll.Pos_Text(titleEn, 0, -2, 1, 1, 0, 0);
    printerDll.Pos_FeedLine();
    printerDll.Pos_FeedLine(); // 额外换行
    
    // 3. 打印票号标签（繁体中文 + 英文）
    // 繁体中文：您的號碼
    printerDll.Pos_Text('您的號碼', 0, -2, 1, 1, 0, 0);
    printerDll.Pos_FeedLine();
    // 英文：Your Number
    printerDll.Pos_Text('Your Number', 0, -2, 1, 1, 0, 0);
    printerDll.Pos_FeedLine();
    
    // 4. 打印票号（超大字体，加粗）
    printerDll.Pos_Text(ticket_number, 0, -2, 3, 3, 0, 0x08); // 3倍宽高，加粗
    printerDll.Pos_FeedLine();
    printerDll.Pos_FeedLine(); // 额外换行
    
    // 5. 打印等待人数（繁体中文 + 英文）
    // 繁体中文：前面等待人數
    printerDll.Pos_Text('前面等待人數', 0, -2, 1, 1, 0, 0);
    printerDll.Pos_FeedLine();
    // 英文：People Waiting
    printerDll.Pos_Text('People Waiting', 0, -2, 1, 1, 0, 0);
    printerDll.Pos_FeedLine();
    
    // 6. 打印等待人数数值（大字体）
    printerDll.Pos_Text(`${waiting_count}`, 0, -2, 2, 2, 0, 0x08); // 2倍宽高，加粗
    printerDll.Pos_FeedLine();
    printerDll.Pos_FeedLine(); // 额外换行
    
    // 7. 打印分隔线
    printerDll.Pos_Text('--------------------------------', 0, -1, 1, 1, 0, 0);
    printerDll.Pos_FeedLine();
    
    // 8. 打印日期时间（可选，左对齐）
    printerDll.Pos_Align(0); // 左对齐
    printerDll.Pos_Text(`日期 Date: ${dateStr}`, 0, -1, 1, 1, 0, 0);
    printerDll.Pos_FeedLine();
    printerDll.Pos_Text(`時間 Time: ${timeStr}`, 0, -1, 1, 1, 0, 0);
    printerDll.Pos_FeedLine();
    
    // 9. 打印提示信息（居中对齐）
    printerDll.Pos_Align(1); // 居中对齐
    printerDll.Pos_FeedLine();
    printerDll.Pos_Text('請妥善保管您的票號', 0, -2, 1, 1, 0, 0);
    printerDll.Pos_FeedLine();
    printerDll.Pos_Text('Please keep your ticket safe', 0, -2, 1, 1, 0, 0);
    printerDll.Pos_FeedLine();
    
    // 10. 进纸（切纸前留出空间）
    printerDll.Pos_Feed_N_Line(2);
    
    // 11. 切纸（如果有切刀功能）
    try {
      printerDll.Pos_FullCutPaper();
    } catch (error) {
      // 如果没有切刀功能，忽略错误
      printerLogger.debug('打印机可能没有切刀功能', { error: error.message });
    }
    
    // 12. 再进纸一行
    printerDll.Pos_FeedLine();
    
    printerLogger.info('打印成功', {
      ticket_number,
      business_type_name,
      business_type_english_name: business_type_english_name || '(无英文名称)',
      waiting_count,
      date: dateStr,
      time: timeStr
    });
    
    return {
      success: true,
      message: '打印成功'
    };
    
  } catch (error) {
    printerLogger.error('打印失败', {
      error: error.message,
      stack: error.stack,
      ticket_number,
      business_type_name,
      waiting_count
    });
    return {
      success: false,
      message: `打印失败: ${error.message}`
    };
  }
}

/**
 * 关闭打印机连接
 * @returns {Promise<boolean>} 是否成功
 */
async function closePrinter() {
  return await closePort();
}

/**
 * 查询打印机状态
 * @returns {Promise<{status: string, error: number}>} 打印机状态
 */
async function queryPrinterStatus() {
  if (!printerDll || !printerHandle) {
    return {
      status: '未连接',
      error: -999
    };
  }
  
  try {
    const errorCode = printerDll.Pos_QueryPrinterErr(3000); // 3秒超时
    
    const statusMap = {
      1: '正常',
      '-1': '脱机',
      '-2': '上盖打开',
      '-3': '缺纸',
      '-4': '切刀异常',
      '-5': '头片温度过高',
      '-6': '查询失败'
    };
    
    const status = statusMap[errorCode] || '未知状态';
    printerLogger.debug('查询打印机状态', { status, errorCode });
    return {
      status,
      error: errorCode
    };
  } catch (error) {
    printerLogger.error('查询打印机状态失败', { 
      error: error.message,
      stack: error.stack
    });
    return {
      status: '查询失败',
      error: -999
    };
  }
}

module.exports = {
  initPrinter,
  printTicket,
  closePrinter,
  queryPrinterStatus,
  isAvailable: () => printerDll !== null,
  getConfig: () => ({ ...PRINTER_CONFIG })
};
