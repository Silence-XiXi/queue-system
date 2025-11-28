/**
 * 测试定时重置任务脚本
 * 使用方法：node test-reset.js
 */

const dailyResetScheduler = require('./utils/dailyResetScheduler');

async function testReset() {
  console.log('========== 开始测试定时重置任务 ==========');
  console.log('');
  
  try {
    // 1. 查看当前状态
    console.log('1. 查看定时任务状态：');
    const status = dailyResetScheduler.getStatus();
    console.log(JSON.stringify(status, null, 2));
    console.log('');
    
    // 2. 执行测试重置
    console.log('2. 执行测试重置...');
    await dailyResetScheduler.testSchedule();
    console.log('');
    
    // 3. 查看重置后的状态
    console.log('3. 重置后的状态：');
    const statusAfter = dailyResetScheduler.getStatus();
    console.log(JSON.stringify(statusAfter, null, 2));
    console.log('');
    
    console.log('========== 测试完成 ==========');
    console.log('');
    console.log('✅ 重置任务执行成功！');
    console.log('📱 请检查 CounterView 页面是否：');
    console.log('   - 收到了 "ticket:dailyReset" 事件');
    console.log('   - 自动刷新了所有数据（等待人数、当前票号、上一个服务号）');
    console.log('   - 显示了 "每日重置已完成" 的 Toast 提示');
    
    process.exit(0);
  } catch (error) {
    console.error('========== 测试失败 ==========');
    console.error('错误详情:', error);
    console.error('错误堆栈:', error.stack);
    process.exit(1);
  }
}

// 执行测试
testReset();

