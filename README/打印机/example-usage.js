/**
 * 打印机服务使用示例
 * 
 * 这个文件展示了如何在不同场景下使用打印机服务
 */

const printerService = require('../services/printerService');

// 示例 1: 检查打印机是否可用
async function checkPrinterAvailability() {
  const isAvailable = printerService.isAvailable();
  console.log('打印机可用:', isAvailable);
  
  if (!isAvailable) {
    console.log('请检查:');
    console.log('1. 是否已安装 ffi-napi: npm install ffi-napi ref-napi');
    console.log('2. DLL 文件路径是否正确');
    console.log('3. DLL 文件是否存在');
  }
}

// 示例 2: 初始化打印机
async function initializePrinter() {
  console.log('正在初始化打印机...');
  const success = await printerService.initPrinter();
  
  if (success) {
    console.log('打印机初始化成功');
  } else {
    console.log('打印机初始化失败');
  }
}

// 示例 3: 打印票号
async function printExampleTicket() {
  const ticketData = {
    ticket_number: 'A001',
    business_type_name: '业务办理',
    business_type_english_name: 'Business Service',
    waiting_count: 5
  };
  
  console.log('正在打印票号:', ticketData.ticket_number);
  const result = await printerService.printTicket(ticketData);
  
  if (result.success) {
    console.log('打印成功:', result.message);
  } else {
    console.log('打印失败:', result.message);
  }
}

// 示例 4: 完整的打印流程
async function completePrintFlow() {
  try {
    // 1. 检查打印机可用性
    if (!printerService.isAvailable()) {
      console.error('打印机不可用，请检查配置');
      return;
    }
    
    // 2. 初始化打印机
    const initSuccess = await printerService.initPrinter();
    if (!initSuccess) {
      console.error('打印机初始化失败');
      return;
    }
    
    // 3. 打印票号
    const ticketData = {
      ticket_number: 'B123',
      business_type_name: '咨询业务',
      waiting_count: 3
    };
    
    const printResult = await printerService.printTicket(ticketData);
    console.log('打印结果:', printResult);
    
    // 4. 关闭打印机（如果需要）
    await printerService.closePrinter();
    
  } catch (error) {
    console.error('打印流程出错:', error);
  }
}

// 运行示例
if (require.main === module) {
  (async () => {
    console.log('=== 打印机服务示例 ===\n');
    
    await checkPrinterAvailability();
    console.log('');
    
    await initializePrinter();
    console.log('');
    
    await printExampleTicket();
    console.log('');
    
    // 取消注释以运行完整流程
    // await completePrintFlow();
  })();
}

module.exports = {
  checkPrinterAvailability,
  initializePrinter,
  printExampleTicket,
  completePrintFlow
};

