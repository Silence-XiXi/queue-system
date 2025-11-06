const bcrypt = require('bcryptjs');
const { settings: Setting, counters: Counter, sequelize } = require('../models');
const { Op } = require('sequelize');

// 管理员登录验证
const login = async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ message: '密码不能为空' });
    }

    // 从数据库获取管理员密码设置
    const adminPasswordSetting = await Setting.findOne({ where: { key: 'admin_password' } });
    
    if (!adminPasswordSetting) {
      return res.status(500).json({ message: '系统未配置管理员密码' });
    }

    // 验证密码
    const isPasswordValid = bcrypt.compareSync(password, adminPasswordSetting.value);
    
    if (!isPasswordValid) {
      return res.status(401).json({ message: '密码错误' });
    }

    // 返回成功信息和简单的登录令牌（实际应用中应使用JWT）
    const loginToken = Buffer.from(`admin_${Date.now()}`).toString('base64');
    
    res.json({
      message: '登录成功',
      token: loginToken
    });
  } catch (error) {
    // console.error('管理员登录验证失败:', error);
    res.status(500).json({ message: '管理员登录验证失败', error: error.message });
  }
};

// 获取所有系统设置
const getAllSettings = async (req, res) => {
  try {
    // 获取所有系统设置，但不返回管理员密码
    const settings = await Setting.findAll({
      where: {
        key: {
          [Op.ne]: 'admin_password' // 不返回密码信息
        }
      }
    });
    
    res.json(settings);
  } catch (error) {
    // console.error('获取系统设置失败:', error);
    res.status(500).json({ message: '获取系统设置失败', error: error.message });
  }
};

// 更新系统设置
const updateSetting = async (req, res) => {
  const { key } = req.params;
  const { value, description } = req.body;
  
  try {
    // 不允许直接通过此API更新管理员密码
    if (key === 'admin_password') {
      return res.status(403).json({ message: '不允许通过此API更新管理员密码' });
    }
    
    const setting = await Setting.findOne({ where: { key } });
    
    if (!setting) {
      return res.status(404).json({ message: '设置项不存在' });
    }
    
    const updateData = {};
    if (value !== undefined) updateData.value = value;
    if (description !== undefined) updateData.description = description;
    
    await setting.update(updateData);
    
    res.json(setting);
  } catch (error) {
    // console.error('更新系统设置失败:', error);
    res.status(500).json({ message: '更新系统设置失败', error: error.message });
  }
};

// 更新管理员密码
const updateAdminPassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: '当前密码和新密码都不能为空' });
  }
  
  try {
    // 获取当前密码设置
    const adminPasswordSetting = await Setting.findOne({ where: { key: 'admin_password' } });
    
    if (!adminPasswordSetting) {
      return res.status(500).json({ message: '系统未配置管理员密码' });
    }
    
    // 验证当前密码
    const isCurrentPasswordValid = bcrypt.compareSync(currentPassword, adminPasswordSetting.value);
    
    if (!isCurrentPasswordValid) {
      return res.status(401).json({ message: '当前密码错误' });
    }
    
    // 对新密码进行加密
    const salt = bcrypt.genSaltSync(10);
    const hashedNewPassword = bcrypt.hashSync(newPassword, salt);
    
    // 更新密码
    await adminPasswordSetting.update({ value: hashedNewPassword });
    
    res.json({ message: '密码更新成功' });
  } catch (error) {
    // console.error('更新管理员密码失败:', error);
    res.status(500).json({ message: '更新管理员密码失败', error: error.message });
  }
};

// 设备相关的控制器方法已被移除

// 获取所有柜台信息
const getAllCounters = async (req, res) => {
  try {
    // 使用Sequelize模型方法，使用蛇形命名法匹配数据库字段
    const counters = await Counter.findAll({
      attributes: ['id', 'counter_number', 'name', 'ip_address', 'created_at', 'updated_at'],
      order: [['counter_number', 'ASC']]
    });
    
    // 将蛇形命名转换为驼峰命名，保持前端兼容性
    const formattedCounters = counters.map(counter => {
      const plainCounter = counter.get({ plain: true });
      return {
        id: plainCounter.id,
        counterNumber: plainCounter.counter_number,
        name: plainCounter.name,
        ipAddress: plainCounter.ip_address,
        createdAt: plainCounter.created_at,
        updatedAt: plainCounter.updated_at
      };
    });
    
    // console.log('查询到的counters数据:', formattedCounters);
    res.json(formattedCounters);
  } catch (error) {
    console.error('获取柜台列表失败:', error);
    res.status(500).json({ message: 'Failed to get counter list', error: error.message });
  }
};

// 创建新的柜台
const createCounter = async (req, res) => {
  const { counterNumber, name, ipAddress } = req.body;
  
  if (!counterNumber || !name) {
    return res.status(400).json({ message: 'Counter number and name cannot be empty' });
  }
  
  try {
    // 检查柜台号是否已存在
    const existingCounter = await Counter.findOne({ where: { counter_number: counterNumber } });
    
    if (existingCounter) {
      return res.status(400).json({ message: 'Counter number already exists' });
    }
    
    // 创建新柜台
    const counter = await Counter.create({
      counter_number: counterNumber,
      name,
      ip_address: ipAddress
    });
    
    // 转换为前端需要的格式
    const formattedCounter = {
      id: counter.id,
      counterNumber: counter.counter_number,
      name: counter.name,
      ipAddress: counter.ip_address,
      createdAt: counter.created_at,
      updatedAt: counter.updated_at
    };
    
    res.status(201).json(formattedCounter);
  } catch (error) {
    console.error('创建柜台失败:', error);
    res.status(500).json({ message: 'Failed to create counter', error: error.message });
  }
};

// 更新柜台信息
const updateCounter = async (req, res) => {
  const { id } = req.params;
  const { counterNumber, name, ipAddress } = req.body;
  
  try {
    const counter = await Counter.findByPk(id);
    
    if (!counter) {
      return res.status(404).json({ message: 'Counter not found' });
    }
    
    // 如果更改柜台号，需要检查新号码是否与其他柜台冲突
    if (counterNumber && counterNumber !== counter.counter_number) {
      const existingCounter = await Counter.findOne({ where: { counter_number: counterNumber } });
      
      if (existingCounter) {
        return res.status(400).json({ message: 'Counter number already in use by another counter' });
      }
    }
    
    // 更新柜台信息
    const updateData = {};
    if (counterNumber !== undefined) updateData.counter_number = counterNumber;
    if (name !== undefined) updateData.name = name;
    if (ipAddress !== undefined) updateData.ip_address = ipAddress;
    
    await counter.update(updateData);
    
    // 更新后重新查询以确保获取更新后的数据
    const updatedCounter = await Counter.findByPk(id);
    
    // 转换为前端需要的格式
    const formattedCounter = {
      id: updatedCounter.id,
      counterNumber: updatedCounter.counter_number,
      name: updatedCounter.name,
      ipAddress: updatedCounter.ip_address,
      createdAt: updatedCounter.created_at,
      updatedAt: updatedCounter.updated_at
    };
    
    res.json(formattedCounter);
  } catch (error) {
    console.error('更新柜台信息失败:', error);
    res.status(500).json({ message: 'Failed to update counter', error: error.message });
  }
};

// 删除柜台
const deleteCounter = async (req, res) => {
  const { id } = req.params;
  const transaction = await sequelize.transaction();
  
  try {
    const counter = await Counter.findByPk(id, { transaction });
    
    if (!counter) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Counter not found' });
    }
    
    // 票号和呼叫日志表已移除，不再需要处理相关联数据
    
    // 删除柜台记录
    await counter.destroy({ transaction });
    
    // 提交事务
    await transaction.commit();
    
    res.json({ message: 'Counter deleted successfully' });
  } catch (error) {
    // 回滚事务
    await transaction.rollback();
    console.error('删除柜台失败:', error);
    console.error('错误堆栈:', error.stack);
    res.status(500).json({ 
      message: 'Failed to delete counter', 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined 
    });
  }
};

module.exports = {
  login,
  getAllSettings,
  updateSetting,
  updateAdminPassword,
  getAllCounters,
  createCounter,
  updateCounter,
  deleteCounter
};
