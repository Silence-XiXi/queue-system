const { BusinessType } = require('../models');

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

module.exports = {
  getAllBusinessTypes
};
