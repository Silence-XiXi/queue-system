/**
 * 打印机服务模块
 * 使用 ffi-napi 调用打印机 DLL (CsnPrinterLibs.dll)
 */

const path = require('path');
const fs = require('fs');
const printerLogger = require('../utils/printerLogger');

// 依赖：npm install iconv-lite
const iconv = require('iconv-lite');

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

// 定义 wchar_t 及 wchar_t* 类型（适配 Windows DLL 的 const wchar_t*）
// Windows 下 wchar_t = 2字节无符号短整型（ushort）
let wchar_t = null;
let wchar_t_ptr = null;

/**
 * 调用 Pos_Text 打印文本
 * @param {string} text - 要打印的文本
 * @param {number} encoding - 编码类型：0=GBK, 1=UTF-8, 3=BIG-5
 * @param {number} position - 位置
 * @param {number} widthTimes - 宽度倍数
 * @param {number} heightTimes - 高度倍数
 * @param {number} fontType - 字体类型
 * @param {number} fontStyle - 字体样式
 */
/**
 * 将字符串转换为 wchar_t* 所需的 UTF-16LE Buffer（带双字节终止符）
 * @param {string} str - 要转换的字符串
 * @returns {Buffer} UTF-16LE 编码的 Buffer（包含 null 终止符 0x0000）
 */
function toWcharBuffer(str) {
  if (!str || str.trim() === '') {
    // 空字符串返回双字节终止符（0x0000）
    return Buffer.alloc(2, 0);
  }
  // 核心：字符串 + '\0' → 转 UTF-16LE → 自动生成双字节终止符（0x0000）
  return Buffer.from(str + '\0', 'utf16le');
}

/**
 * 调用 Pos_Text 打印文本
 * @param {string} text - 要打印的文本
 * @param {number} encoding - 编码类型：0=GBK, 1=UTF-8, 3=BIG-5
 * @param {number} position - 位置
 * @param {number} widthTimes - 宽度倍数
 * @param {number} heightTimes - 高度倍数
 * @param {number} fontType - 字体类型
 * @param {number} fontStyle - 字体样式
 */
function printText(text, encoding, position, widthTimes, heightTimes, fontType, fontStyle) {
  if (!printerDll || !wchar_t_ptr) {
    return false;
  }
  
  try {
    // 将字符串转换为 UTF-16LE Buffer（wchar_t* 格式）
    const wcharBuffer = toWcharBuffer(text);
    
    // 直接传递 Buffer，ffi-napi 会自动处理 wchar_t* 指针转换
    // DLL 会根据 nLan 参数（encoding）来处理编码转换
    const result = printerDll.Pos_Text(wcharBuffer, encoding, position, widthTimes, heightTimes, fontType, fontStyle);
    
    return result;
  } catch (error) {
    printerLogger.error('printText 调用失败', {
      error: error.message,
      text: text.substring(0, 50),
      encoding,
      stack: error.stack
    });
    return false;
  }
}

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
    printerName: "POS80",
    tcpPort: 9100,
    baudrate: 9600,
    flowcontrol: 0,
    parity: 0,
    databits: 8,
    stopbits: 0,
    enabled: true,
    textEncoding: 1 // 文本编码：0=GBK(UTF-16LE), 1=UTF-8(UTF-16LE), 3=BIG-5(ANSI Buffer，直接传递)
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
    printerName: process.env.PRINTER_PRINTER_NAME || fileConfig.printerName || undefined,
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
      : (fileConfig.enabled !== undefined ? fileConfig.enabled : defaultConfig.enabled),
    textEncoding: process.env.PRINTER_TEXT_ENCODING 
      ? parseInt(process.env.PRINTER_TEXT_ENCODING) 
      : (fileConfig.textEncoding !== undefined ? fileConfig.textEncoding : defaultConfig.textEncoding)
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
    
    // 定义 wchar_t 及 wchar_t* 类型（适配 Windows DLL 的 const wchar_t*）
    // Windows 下 wchar_t = 2字节无符号短整型（ushort）
    wchar_t = ref.types.ushort;
    wchar_t_ptr = ref.refType(wchar_t); // 定义 wchar_t* 指针类型
    console.log('✓ wchar_t 类型定义完成');
    
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
      // 端口枚举函数
      'Port_EnumUSB': ['size_t', ['pointer', 'size_t']],
      
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
      'Pos_SelfTest': ['bool', []],
      'Pos_FeedLine': ['bool', []],
      'Pos_Feed_N_Line': ['bool', ['int']],
      'Pos_Align': ['bool', ['int']],
      'Pos_Text': ['bool', [wchar_t_ptr, 'int', 'int', 'int', 'int', 'int', 'int']],
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
    let actualPortName = PRINTER_CONFIG.portName;
    
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
        // 直接使用 Port_OpenPRNIO 打开打印机驱动端口
        // 优先使用配置的打印机名称，如果没有则使用 portName
        const printerName = PRINTER_CONFIG.printerName || PRINTER_CONFIG.portName;
        
        if (!printerName) {
          throw new Error('USB端口类型需要配置 printerName 或 portName（打印机名称，如 POS80）');
        }
        
        printerLogger.info(`使用 Port_OpenPRNIO 打开打印机: ${printerName}`);
        handle = printerDll.Port_OpenPRNIO(printerName);
        
        if (handle.isNull()) {
          throw new Error(`无法使用 Port_OpenPRNIO 打开打印机 "${printerName}"。请检查：\n` +
            `1. 打印机名称是否正确（在Windows设置中查看打印机名称）\n` +
            `2. 打印机是否已安装驱动并正常工作\n` +
            `3. 尝试在Windows设置中打印测试页，确认打印机正常`);
        }
        
        actualPortName = printerName;
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
    
    // 检查句柄是否有效（非零表示成功，零表示失败）
    if (handle.isNull()) {
      const errorMsg = `无法打开端口 ${actualPortName}，请检查：\n` +
        `1. 打印机是否已连接并开机\n` +
        `2. 设备管理器中是否显示"USB Printing Support"\n` +
        `3. 如果显示的是"Prolific USB-to-Serial Comm Port"，请改用COM端口类型`;
      throw new Error(errorMsg);
    }
    
    // 设置端口
    const setResult = printerDll.Port_SetPort(handle);
    if (!setResult) {
      printerDll.Port_ClosePort(handle);
      throw new Error('设置端口失败');
    }
    
    printerHandle = handle;
    printerLogger.info(`打印机端口打开成功: ${PRINTER_CONFIG.portType}:${actualPortName}`);
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
    
    // 打印测试页
    const selfTestResult = printerDll.Pos_SelfTest();
    if (!selfTestResult) {
      printerLogger.warn('打印测试页失败，但继续执行');
    } else {
      printerLogger.info('打印机测试页打印成功');
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
    // 格式化为：2025-11-26 12:54:35
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    const dateTimeStr = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    
    // 繁体中文编码：根据 C++ 示例，繁体中文总是使用 nLan=3 (BIG-5)
    // 无论配置的编码是什么，繁体中文都使用 BIG-5 编码（nLan=3）
    const TRADITIONAL_CHINESE_ENCODING = 3; // 繁体中文固定使用 BIG-5
    
    // 打印内容布局（与取票成功弹窗一致）
    // 参数：文本, 编码(0=GBK, 1=UTF-8, 3=BIG-5), 位置(-2=居中), 宽度倍数, 高度倍数, 字体类型(0=12*24), 字体样式(0=正常)
    // 使用配置的文本编码，如果未配置则默认使用 GBK (0)
    const TEXT_ENCODING = PRINTER_CONFIG.textEncoding !== undefined ? PRINTER_CONFIG.textEncoding : 0;
    
    // 编码说明：
    // 0 = GBK（简体中文，大多数POS打印机默认支持）- 使用 UTF-16LE 宽字符编码
    // 1 = UTF-8（通用编码，支持多语言）- 使用 UTF-16LE 宽字符编码
    // 3 = BIG-5（繁体中文专用）- 使用 ANSI 多字节编码（BIG-5 Buffer），直接传递，不转 UTF-16LE
    
    printerLogger.debug(`使用文本编码: ${TEXT_ENCODING} (${TEXT_ENCODING === 0 ? 'GBK' : TEXT_ENCODING === 1 ? 'UTF-8' : TEXT_ENCODING === 3 ? 'BIG-5' : '未知'})`);
    
    // 1. 居中对齐
    printerDll.Pos_Align(1); // 1 = 居中对齐
    
    // 2. 打印标题（繁体中文 + 英文，参考弹窗）
    // 繁体中文：您已成功獲取【業務類型】服務號碼
    const titleZh = `您已成功獲取【${business_type_name}】服務號碼`;
    printText(titleZh, TRADITIONAL_CHINESE_ENCODING, -2, 1, 1, 0, 0x08); // 使用繁体中文编码，加粗
    printerDll.Pos_FeedLine();
    
    // 英文：You have successfully obtained a [Service Type] service number
    // 注意：英文文本使用英文括号 []，因为打印机不支持英文中的【】
    const titleEn = business_type_english_name 
      ? `You have successfully obtained a [${business_type_english_name}] service number`
      : `You have successfully obtained a service number`;
    printText(titleEn, TEXT_ENCODING, -2, 1, 1, 0, 0); // 使用配置的编码，缩小字号
    printerDll.Pos_FeedLine();
    printerDll.Pos_FeedLine(); // 额外换行
    
    // 3. 打印票号标签（繁体中文 + 英文）
    // 繁体中文：您的號碼
    printText('您的號碼', TRADITIONAL_CHINESE_ENCODING, -2, 1, 1, 0, 0); // 使用繁体中文编码
    printerDll.Pos_FeedLine();
    // 英文：Your Number
    printText('Your Number', TEXT_ENCODING, -2, 1, 1, 0, 0); // 使用配置的编码
    printerDll.Pos_FeedLine();
    
    // 4. 打印票号（超大字体，加粗）
    printText(ticket_number, TEXT_ENCODING, -2, 3, 3, 0, 0x08); // 3倍宽高，加粗，使用配置的编码
    printerDll.Pos_FeedLine();
    printerDll.Pos_FeedLine(); // 额外换行
    
    // 5. 打印等待人数（繁体中文 + 英文）
    // 繁体中文：前面等待人數
    printText('前面等待人數', TRADITIONAL_CHINESE_ENCODING, -2, 1, 1, 0, 0); // 使用繁体中文编码
    printerDll.Pos_FeedLine();
    // 英文：People Waiting
    printText('People Waiting', TEXT_ENCODING, -2, 1, 1, 0, 0); // 使用配置的编码
    printerDll.Pos_FeedLine();
    
    // 6. 打印等待人数数值（大字体）
    printText(`${waiting_count}`, TEXT_ENCODING, -2, 2, 2, 0, 0x08); // 2倍宽高，加粗，使用配置的编码
    printerDll.Pos_FeedLine();
    printerDll.Pos_FeedLine(); // 额外换行
    
    // 7. 打印分隔线
    printText('------------------------', TEXT_ENCODING, -1, 1, 1, 0, 0); // 使用配置的编码
    printerDll.Pos_FeedLine();
    
    // 8. 打印日期时间（可选，左对齐）
    printerDll.Pos_Align(1); // 左对齐
    printText(dateTimeStr, TEXT_ENCODING, -2, 1, 1, 0, 0); // 格式：2025-11-26 12:54:35
    printerDll.Pos_FeedLine();
    
    // 9. 打印提示信息（居中对齐）
    printerDll.Pos_Align(1); // 居中对齐
    printerDll.Pos_FeedLine();
    // 繁体中文：請妥善保管您的票號
    printText('請妥善保管您的票號', TRADITIONAL_CHINESE_ENCODING, -2, 1, 1, 0, 0); // 使用繁体中文编码
    printerDll.Pos_FeedLine();
    // 英文：Please keep your ticket safe
    printText('Please keep your ticket safe', TEXT_ENCODING, -2, 1, 1, 0, 0); // 使用配置的编码，缩小字号
    printerDll.Pos_FeedLine();
    
    // 10. 进纸（切纸前留出空间）
    printerDll.Pos_Feed_N_Line(3);
    
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
      dateTime: dateTimeStr
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
