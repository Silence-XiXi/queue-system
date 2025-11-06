const { sequelize, counters: Counter } = require('../models');
const { Op } = require('sequelize');

// 获取所有窗口
const getAllCounters = async (req, res) => {
  try {
    // 现在使用模型查询
    const counters = await Counter.findAll();
    res.json(counters);
  } catch (error) {
    console.error('获取窗口列表失败:', error);
    res.status(500).json({ message: '获取窗口列表失败', error: error.message });
  }
};

// 更新窗口信息
const updateCounter = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  
  try {
    // 首先检查窗口是否存在
    const counter = await Counter.findByPk(id);
    
    if (!counter) {
      return res.status(404).json({ message: '窗口不存在' });
    }
    
    // 更新窗口状态
    if (status) {
      await counter.update({ status });
    }
    
    // 重新查询获取更新后的数据
    const updatedCounter = await Counter.findByPk(id);
    
    res.json(updatedCounter);
  } catch (error) {
    console.error('更新窗口失败:', error);
    res.status(500).json({ message: '更新窗口失败', error: error.message });
  }
};

// 票号相关功能已移除

// 结束服务
const endService = async (req, res) => {
  const { id } = req.params;
  
  try {
    // 首先检查窗口是否存在
    const counter = await Counter.findByPk(id);
    
    if (!counter) {
      return res.status(404).json({ message: '窗口不存在' });
    }
    
    // 更新窗口状态
    await counter.update({
      status: 'available',
      current_ticket_number: null
    });
    
    res.json({ success: true, message: '服务已结束' });
  } catch (error) {
    console.error('结束服务失败:', error);
    res.status(500).json({ message: '结束服务失败', error: error.message });
  }
};

module.exports = {
  getAllCounters,
  updateCounter,
  endService
};
