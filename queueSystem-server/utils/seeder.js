const { sequelize, businessTypes: BusinessType, counters: Counter, settings: Setting } = require('../models');

// 填充初始数据
const seedDatabase = async () => {
  try {
    // 检查业务类型表是否已有数据
    const businessTypeCount = await BusinessType.count();
    if (businessTypeCount === 0) {
      console.log('填充业务类型数据...');
      await BusinessType.bulkCreate([
        { name: '優惠客戶專綫', code: 'A', prefix: 'A' },
        { name: '訂購專綫', code: 'B', prefix: 'B' },
        { name: '特快訂購專綫', code: 'C', prefix: 'C' },
        { name: '訪問服務', code: 'D', prefix: 'D' },
        { name: '總裁組服務專綫', code: 'E', prefix: 'E' }
      ]);
    }
    
    // 检查窗口表是否已有数据
    const counterCount = await Counter.count();
    if (counterCount === 0) {
      console.log('填充窗口数据...');
      await Counter.bulkCreate([
        { counter_number: 1, name: '1号窗口', status: 'closed' },
        { counter_number: 2, name: '2号窗口', status: 'closed' },
        { counter_number: 3, name: '3号窗口', status: 'closed' },
        { counter_number: 4, name: '4号窗口', status: 'closed' },
        { counter_number: 5, name: '5号窗口', status: 'closed' },
        { counter_number: 6, name: '6号窗口', status: 'closed' }
      ]);
    }
    
    // 检查设置表是否已有数据
    const settingCount = await Setting.count();
    if (settingCount === 0) {
      console.log('填充系统设置数据...');
      await Setting.bulkCreate([
        { key: 'voice_enabled', value: 'true', description: '是否启用语音' },
        { key: 'voice_volume', value: '80', description: '语音音量(0-100)' },
        { key: 'display_rows', value: '10', description: '显示屏显示的行数' }
      ]);
    }
    
    console.log('数据填充完成');
  } catch (error) {
    console.error('填充初始数据失败:', error);
    throw error;
  }
};

module.exports = {
  seedDatabase
};
