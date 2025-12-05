/**
 * 打印机日志记录模块
 * 用于将打印机的错误和调试信息保存到日志文件中
 */

const fs = require('fs');
const path = require('path');

// 判断是否在打包环境中
const isPacked = typeof process.pkg !== 'undefined';

// 获取日志文件路径
function getLogFilePath() {
  // 如果设置了环境变量，优先使用
  if (process.env.PRINTER_LOG_PATH) {
    return process.env.PRINTER_LOG_PATH;
  }
  
  if (isPacked) {
    // 打包环境：日志文件放在可执行文件同目录下
    const execPath = process.execPath;
    const execDir = path.dirname(execPath);
    return path.join(execDir, 'printer.log');
  } else {
    // 开发环境：日志文件放在项目根目录下
    return path.join(__dirname, '../../printer.log');
  }
}

// 日志文件路径
const LOG_FILE_PATH = getLogFilePath();

// 日志级别
const LOG_LEVELS = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
  OFF: 'OFF' // 关闭日志输出
};

// 日志级别优先级（数字越大优先级越高）
const LOG_LEVEL_PRIORITY = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  OFF: 999 // OFF 最大，表示任何级别都不会写入
};

/**
 * 从环境变量或 printer.config.json 读取日志级别
 * 优先级：环境变量 PRINTER_LOG_LEVEL > 配置文件 logLevel > 默认 INFO
 */
function loadCurrentLogLevel() {
  // 1. 环境变量优先
  if (process.env.PRINTER_LOG_LEVEL) {
    return process.env.PRINTER_LOG_LEVEL.toUpperCase();
  }

  // 2. 尝试从 printer.config.json 读取 logLevel
  try {
    const configPaths = [
      // 打包环境：当前工作目录
      path.join(process.cwd(), 'printer.config.json'),
      // 开发环境：项目根目录及上级目录做兜底
      path.join(__dirname, '../printer.config.json'),
      path.join(__dirname, '../../printer.config.json')
    ];

    for (const configPath of configPaths) {
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf8');
        const config = JSON.parse(content);
        if (config && typeof config.logLevel === 'string') {
          return config.logLevel.toUpperCase();
        }
      }
    }
  } catch (e) {
    // 配置读取失败不影响主流程，直接回退到默认级别
  }

  // 3. 默认 INFO
  return 'INFO';
}

// 获取当前日志级别（可通过环境变量或 printer.config.json 控制）
// 可选值：DEBUG, INFO, WARN, ERROR, OFF
const CURRENT_LOG_LEVEL = loadCurrentLogLevel();
const CURRENT_LOG_PRIORITY = LOG_LEVEL_PRIORITY[CURRENT_LOG_LEVEL] !== undefined 
  ? LOG_LEVEL_PRIORITY[CURRENT_LOG_LEVEL] 
  : LOG_LEVEL_PRIORITY.INFO;

// 最大日志文件大小（10MB）
const MAX_LOG_SIZE = 10 * 1024 * 1024;

// 备份日志文件
function rotateLogFile() {
  try {
    if (fs.existsSync(LOG_FILE_PATH)) {
      const stats = fs.statSync(LOG_FILE_PATH);
      if (stats.size > MAX_LOG_SIZE) {
        // 创建备份文件（带时间戳）
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = LOG_FILE_PATH.replace('.log', `-${timestamp}.log`);
        fs.renameSync(LOG_FILE_PATH, backupPath);
        
        // 只保留最近的5个备份文件
        const logDir = path.dirname(LOG_FILE_PATH);
        const logBaseName = path.basename(LOG_FILE_PATH, '.log');
        const files = fs.readdirSync(logDir)
          .filter(file => file.startsWith(logBaseName) && file.endsWith('.log') && file !== path.basename(LOG_FILE_PATH))
          .map(file => ({
            name: file,
            path: path.join(logDir, file),
            time: fs.statSync(path.join(logDir, file)).mtime
          }))
          .sort((a, b) => b.time - a.time);
        
        // 删除超过5个的旧备份文件
        if (files.length > 5) {
          files.slice(5).forEach(file => {
            try {
              fs.unlinkSync(file.path);
            } catch (error) {
              // 忽略删除失败的错误
            }
          });
        }
      }
    }
  } catch (error) {
    // 如果日志轮转失败，不影响日志记录
    console.error('日志轮转失败:', error.message);
  }
}

// 格式化日志消息
function formatLogMessage(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const levelStr = level.padEnd(5);
  
  let logMessage = `[${timestamp}] [${levelStr}] ${message}`;
  
  if (data !== null && data !== undefined) {
    try {
      const dataStr = typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data);
      logMessage += `\n${dataStr}`;
    } catch (error) {
      logMessage += `\n[无法序列化数据: ${error.message}]`;
    }
  }
  
  return logMessage + '\n';
}

// 写入日志文件
function writeToLog(level, message, data = null) {
  try {
    // 检查日志级别：只记录优先级大于等于当前设置的日志级别
    const levelPriority = LOG_LEVEL_PRIORITY[level] !== undefined 
      ? LOG_LEVEL_PRIORITY[level] 
      : LOG_LEVEL_PRIORITY.INFO;
    
    // 如果当前日志级别高于要记录的级别，则跳过
    if (levelPriority < CURRENT_LOG_PRIORITY) {
      return;
    }
    
    // 检查并轮转日志文件
    rotateLogFile();
    
    // 格式化日志消息
    const logMessage = formatLogMessage(level, message, data);
    
    // 确保日志目录存在
    const logDir = path.dirname(LOG_FILE_PATH);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    // 追加写入日志文件
    fs.appendFileSync(LOG_FILE_PATH, logMessage, 'utf8');
  } catch (error) {
    // 如果写入日志文件失败，输出到控制台（作为后备）
    console.error(`[打印机日志写入失败] ${message}:`, error.message);
    if (data) {
      console.error('数据:', data);
    }
  }
}

// 日志记录器对象
const printerLogger = {
  /**
   * 记录调试信息
   * @param {string} message - 日志消息
   * @param {any} data - 可选的数据对象
   */
  debug(message, data = null) {
    writeToLog(LOG_LEVELS.DEBUG, message, data);
  },
  
  /**
   * 记录一般信息
   * @param {string} message - 日志消息
   * @param {any} data - 可选的数据对象
   */
  info(message, data = null) {
    writeToLog(LOG_LEVELS.INFO, message, data);
  },
  
  /**
   * 记录警告信息
   * @param {string} message - 日志消息
   * @param {any} data - 可选的数据对象
   */
  warn(message, data = null) {
    writeToLog(LOG_LEVELS.WARN, message, data);
  },
  
  /**
   * 记录错误信息
   * @param {string} message - 日志消息
   * @param {any} data - 可选的数据对象或错误对象
   */
  error(message, data = null) {
    writeToLog(LOG_LEVELS.ERROR, message, data);
  },
  
  /**
   * 获取日志文件路径
   * @returns {string} 日志文件路径
   */
  getLogPath() {
    return LOG_FILE_PATH;
  },
  
  /**
   * 获取当前日志级别
   * @returns {string} 当前日志级别
   */
  getLogLevel() {
    return CURRENT_LOG_LEVEL;
  }
};

module.exports = printerLogger;

