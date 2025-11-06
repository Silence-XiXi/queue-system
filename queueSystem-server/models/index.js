const { Sequelize } = require('sequelize');
const path = require('path');
const fs = require('fs');
const initModels = require('../generated-models-auto/init-models');

// 创建SQLite连接
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: path.join(__dirname, '../database.sqlite'),
  logging: false // 禁用SQL查询日志输出
});

// 初始化所有模型
const models = initModels(sequelize);

// 获取数据库中实际存在的表
async function getActualTables() {
  try {
    // 查询SQLite系统表获取所有表名
    const [results] = await sequelize.query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';");
    return results.map(r => r.name);
  } catch (error) {
    console.error('获取数据库表失败:', error);
    return [];
  }
}

// 导出sequelize实例和所有模型
// 由于models是根据实际数据库通过generate-models-auto.js生成的，
// 所以我们可以直接导出所有模型，确保只包含数据库中存在的表
module.exports = {
  sequelize,
  ...models
};
