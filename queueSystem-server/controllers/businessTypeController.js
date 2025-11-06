const { businessTypes: BusinessType } = require('../models');

// 获取所有业务类型
const getAllBusinessTypes = async (req, res) => {
  try {
    const businessTypes = await BusinessType.findAll({
      where: { status: 'active' },
      order: [['code', 'ASC']]
    });
    res.json(businessTypes);
  } catch (error) {
    console.error('获取业务类型失败:', error);
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
    console.error('创建业务类型失败:', error);
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
    console.error('更新业务类型失败:', error);
    res.status(500).json({ message: '更新业务类型失败', error: error.message });
  }
};

module.exports = {
  getAllBusinessTypes,
  createBusinessType,
  updateBusinessType
};
