const { businessTypes: BusinessType, sequelize, settings: Setting } = require('../models');
const logger = require('../utils/logger');

// 获取所有业务类型
const getAllBusinessTypes = async (req, res) => {
  try {
    const businessTypes = await BusinessType.findAll({
      where: { status: 'active' },
      order: [['code', 'ASC']]
    });
    res.json(businessTypes);
  } catch (error) {
    logger.error('获取业务类型失败:', error);
    res.status(500).json({ message: '获取业务类型失败', error: error.message });
  }
};

// 创建业务类型
const createBusinessType = async (req, res) => {
  try {
    const { name, english_name, code, prefix } = req.body;
    const businessType = await BusinessType.create({
      name,
      english_name,
      code,
      prefix
    });
    res.status(201).json(businessType);
  } catch (error) {
    logger.error('创建业务类型失败:', error);
    res.status(500).json({ message: '创建业务类型失败', error: error.message });
  }
};

// 更新业务类型
const updateBusinessType = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, english_name, code, prefix, status } = req.body;
    const businessType = await BusinessType.findByPk(id);
    
    if (!businessType) {
      return res.status(404).json({ message: '未找到该业务类型' });
    }
    
    await businessType.update({
      name,
      english_name,
      code,
      prefix,
      status
    });
    
    res.json(businessType);
  } catch (error) {
    logger.error('更新业务类型失败:', error);
    res.status(500).json({ message: '更新业务类型失败', error: error.message });
  }
};

// 获取所有业务类型及其最新服务号及对应柜台（用于显示屏）
// 优化版本：合并两次查询为一次，减少数据库访问
const getBusinessTypesWithLatestTickets = async (req, res) => {
  try {
    // 使用优化的 SQL 查询，一次性获取所有业务类型及其最新服务号
    // 使用 ROW_NUMBER() 窗口函数获取每个业务类型的最新服务号
    // 使用 LEFT JOIN 确保所有业务类型都被包含，即使没有服务记录
    const query = `
      WITH RankedTickets AS (
        SELECT 
          bt.id AS business_type_id,
          bt.code,
          bt.name,
          bt.english_name,
          cblt.last_ticket_no,
          c.counter_number,
          c.name AS counter_name,
          ROW_NUMBER() OVER (
            PARTITION BY bt.id 
            ORDER BY 
              CASE 
                WHEN cblt.last_ticket_no IS NULL THEN 0
                ELSE 1
              END DESC,
              cblt.last_ticket_no DESC
          ) AS row_num
        FROM business_types bt
        LEFT JOIN counter_business_last_ticket cblt ON bt.id = cblt.business_type_id
        LEFT JOIN counters c ON cblt.counter_id = c.id
        WHERE bt.status = 'active'
      )
      SELECT 
        business_type_id,
        code,
        name,
        english_name,
        last_ticket_no,
        counter_number,
        counter_name
      FROM RankedTickets
      WHERE row_num = 1 OR row_num IS NULL
      ORDER BY code ASC
    `;

    const [results] = await sequelize.query(query);

    // 格式化结果，确保所有字段都存在
    const finalResults = results.map(row => ({
      business_type_id: row.business_type_id,
      code: row.code,
      name: row.name,
      english_name: row.english_name,
      last_ticket_no: row.last_ticket_no || null,
      counter_number: row.counter_number || null,
      counter_name: row.counter_name || null
    }));

    res.json(finalResults);
  } catch (error) {
    logger.error('获取业务类型及最新服务号失败:', error);
    res.status(500).json({ message: '获取业务类型及最新服务号失败', error: error.message });
  }
};

// 获取显示屏备注信息
const getDisplayRemarks = async (req, res) => {
  try {
    const setting = await Setting.findOne({
      where: { key: 'display_remarks' }
    });
    
    if (!setting) {
      return res.json({ value: '' });
    }
    
    res.json({ value: setting.value || '' });
  } catch (error) {
    logger.error('获取显示屏备注失败:', error);
    res.status(500).json({ message: '获取显示屏备注失败', error: error.message });
  }
};

// 获取语音播报主机IP
const getVoiceBroadcastHostIP = async (req, res) => {
  try {
    const setting = await Setting.findOne({
      where: { key: 'voice_broadcast_host_ip' }
    });
    
    if (!setting) {
      return res.json({ value: '' });
    }
    
    res.json({ value: setting.value || '' });
  } catch (error) {
    logger.error('获取语音播报主机IP失败:', error);
    res.status(500).json({ message: '获取语音播报主机IP失败', error: error.message });
  }
};

// 获取语音音量设置（返回换算后的值）
const getVoiceVolume = async (req, res) => {
  try {
    const setting = await Setting.findOne({
      where: { key: 'voice_volume' }
    });
    
    // 默认值 100，对应 volume = 1.0
    const rawValue = setting?.value || '100';
    // 换算公式: volume = voice_volume / 100
    let volume = parseFloat(rawValue) / 100;
    
    // 确保值在有效范围内 (0 到 1)
    if (isNaN(volume) || volume < 0) volume = 0;
    if (volume > 1) volume = 1;
    
    res.json({ value: volume });
  } catch (error) {
    logger.error('获取语音音量失败:', error);
    res.status(500).json({ message: '获取语音音量失败', error: error.message });
  }
};

// 获取语音语速设置（返回换算后的值）
const getVoiceRate = async (req, res) => {
  try {
    const setting = await Setting.findOne({
      where: { key: 'voice_rate' }
    });
    
    // 默认值 10，对应 rate = 1.0
    const rawValue = setting?.value || '10';
    // 换算公式: rate = voice_rate / 10
    let rate = parseFloat(rawValue) / 10;
    
    // 确保值在有效范围内 (0.1 到 10)
    if (isNaN(rate) || rate < 0.1) rate = 0.1;
    if (rate > 10) rate = 10;
    
    res.json({ value: rate });
  } catch (error) {
    logger.error('获取语音语速失败:', error);
    res.status(500).json({ message: '获取语音语速失败', error: error.message });
  }
};

// 获取取票页面背景图片路径
const getTicketBannerImage = async (req, res) => {
  try {
    const setting = await Setting.findOne({
      where: { key: 'ticket_banner_image' }
    });
    
    // 默认值
    const defaultPath = '/pic/ticket_bg.jpg';
    const imagePath = setting?.value || defaultPath;
    
    res.json({ value: imagePath });
  } catch (error) {
    logger.error('获取取票页面背景图片路径失败:', error);
    res.status(500).json({ message: '获取取票页面背景图片路径失败', error: error.message });
  }
};

// 获取显示屏背景图片路径
const getDisplayBannerImage = async (req, res) => {
  try {
    const setting = await Setting.findOne({
      where: { key: 'display_banner_image' }
    });
    
    // 默认值
    const defaultPath = '/pic/display_bg.png';
    const imagePath = setting?.value || defaultPath;
    
    res.json({ value: imagePath });
  } catch (error) {
    logger.error('获取显示屏背景图片路径失败:', error);
    res.status(500).json({ message: '获取显示屏背景图片路径失败', error: error.message });
  }
};

module.exports = {
  getAllBusinessTypes,
  createBusinessType,
  updateBusinessType,
  getBusinessTypesWithLatestTickets,
  getDisplayRemarks,
  getVoiceBroadcastHostIP,
  getVoiceVolume,
  getVoiceRate,
  getTicketBannerImage,
  getDisplayBannerImage
};
