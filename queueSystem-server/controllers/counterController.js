const { sequelize, counters: Counter, counterBusinessLastTicket: CounterBusinessLastTicket } = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

// 获取所有窗口
const getAllCounters = async (req, res) => {
  try {
    // 现在使用模型查询
    const counters = await Counter.findAll();
    res.json(counters);
  } catch (error) {
    logger.error('获取窗口列表失败:', error);
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
    logger.error('更新窗口失败:', error);
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
    
    // 更新窗口状态（不修改current_ticket_number，保留当前票号）
    await counter.update({
      status: 'available'
    });
    
    res.json({ success: true, message: '服务已结束' });
  } catch (error) {
    logger.error('结束服务失败:', error);
    res.status(500).json({ message: '结束服务失败', error: error.message });
  }
};

// 获取客户端IP地址
const getClientIP = (req, res) => {
  const xff = req.headers['x-forwarded-for'];
  let ip = (Array.isArray(xff) ? xff[0] : (xff || '')).split(',')[0].trim()
    || req.ip
    || (req.socket && req.socket.remoteAddress)
    || (req.connection && req.connection.remoteAddress)
    || (req.connection && req.connection.socket && req.connection.socket.remoteAddress)
    || null;
  if (ip && ip.startsWith('::ffff:')) ip = ip.slice(7);
  res.json({ ip });
};

// 根据IP地址获取柜台信息
const getCounterByIP = async (req, res) => {
  try {
    const { ip } = req.params;
    
    if (!ip) {
      return res.status(400).json({ message: 'IP地址不能为空' });
    }
    
    // 查找匹配IP地址的柜台
    const counter = await Counter.findOne({
      where: { ip_address: ip }
    });
    
    if (!counter) {
      return res.status(404).json({ message: '未找到匹配的柜台' });
    }
    
    res.json(counter);
  } catch (error) {
    logger.error('根据IP获取柜台失败:', error);
    res.status(500).json({ message: '获取柜台信息失败', error: error.message });
  }
};

// 根据柜台号获取柜台信息
const getCounterByNumber = async (req, res) => {
  try {
    const { counterNumber } = req.params;
    
    if (!counterNumber) {
      return res.status(400).json({ message: '柜台号不能为空' });
    }
    
    // 查找匹配柜台号的柜台
    const counter = await Counter.findOne({
      where: { counter_number: counterNumber }
    });
    
    if (!counter) {
      return res.status(404).json({ message: '未找到匹配的柜台' });
    }
    
    res.json(counter);
  } catch (error) {
    logger.error('根据柜台号获取柜台失败:', error);
    res.status(500).json({ message: '获取柜台信息失败', error: error.message });
  }
};

// 根据IP或柜台号自动匹配柜台（用于前端初始化）
const getCounterByIPOrNumber = async (req, res) => {
  try {
    const { ip, counterNumber } = req.query;
    
    let counter = null;
    
    // 优先根据IP查找
    if (ip) {
      counter = await Counter.findOne({
        where: { ip_address: ip }
      });
    }
    
    // 如果IP没找到，且提供了柜台号，则根据柜台号查找
    if (!counter && counterNumber) {
      counter = await Counter.findOne({
        where: { counter_number: parseInt(counterNumber) }
      });
    }
    
    if (!counter) {
      return res.status(404).json({ message: '未找到匹配的柜台' });
    }
    
    res.json(counter);
  } catch (error) {
    logger.error('获取柜台信息失败:', error);
    res.status(500).json({ message: '获取柜台信息失败', error: error.message });
  }
};

// 根据柜台号获取该柜台所有业务类型的上一个服务号
const getLastServiceNumbersByCounterNumber = async (req, res) => {
  try {
    const { counterNumber } = req.params;
    
    if (!counterNumber) {
      return res.status(400).json({ message: '柜台号不能为空' });
    }
    
    // 先根据柜台号查找柜台，获取柜台ID
    const counter = await Counter.findOne({
      where: { counter_number: counterNumber }
    });
    
    if (!counter) {
      return res.status(404).json({ message: '未找到指定的柜台' });
    }
    
    // 查询该柜台所有业务类型的上一个服务号
    const lastTickets = await CounterBusinessLastTicket.findAll({
      where: { counter_id: counter.id },
      attributes: ['business_type_id', 'last_ticket_no']
    });
    
    // 转换为对象格式，key为business_type_id，value为last_ticket_no
    const result = {};
    lastTickets.forEach(item => {
      result[item.business_type_id] = item.last_ticket_no || null;
    });
    
    res.json(result);
  } catch (error) {
    logger.error('获取上一个服务号失败:', error);
    res.status(500).json({ message: '获取上一个服务号失败', error: error.message });
  }
};

// 获取当前柜台所有业务类型的上一个服务号（根据柜台ID）
const getLastServiceNumbersByCounter = async (req, res) => {
  try {
    const { counterId } = req.params;
    
    if (!counterId) {
      return res.status(400).json({ message: '柜台ID不能为空' });
    }
    
    // 查询该柜台所有业务类型的上一个服务号
    const lastTickets = await CounterBusinessLastTicket.findAll({
      where: { counter_id: counterId },
      attributes: ['business_type_id', 'last_ticket_no']
    });
    
    // 转换为对象格式，key为business_type_id，value为last_ticket_no
    const result = {};
    lastTickets.forEach(item => {
      result[item.business_type_id] = item.last_ticket_no || null;
    });
    
    res.json(result);
  } catch (error) {
    logger.error('获取上一个服务号失败:', error);
    res.status(500).json({ message: '获取上一个服务号失败', error: error.message });
  }
};

// 根据柜台号和业务类型ID获取上一个服务号
const getLastServiceNumber = async (req, res) => {
  try {
    const { counterId, businessTypeId } = req.params;
    
    if (!counterId || !businessTypeId) {
      return res.status(400).json({ message: '柜台ID和业务类型ID不能为空' });
    }
    
    // 查询该柜台该业务类型的上一个服务号
    const lastTicket = await CounterBusinessLastTicket.findOne({
      where: {
        counter_id: counterId,
        business_type_id: businessTypeId
      },
      attributes: ['last_ticket_no']
    });
    
    if (!lastTicket) {
      return res.json({ last_ticket_no: null });
    }
    
    res.json({ last_ticket_no: lastTicket.last_ticket_no });
  } catch (error) {
    logger.error('获取上一个服务号失败:', error);
    res.status(500).json({ message: '获取上一个服务号失败', error: error.message });
  }
};

module.exports = {
  getAllCounters,
  updateCounter,
  endService,
  getClientIP,
  getCounterByIP,
  getCounterByNumber,
  getCounterByIPOrNumber,
  getLastServiceNumbersByCounterNumber,
  getLastServiceNumbersByCounter,
  getLastServiceNumber
};
