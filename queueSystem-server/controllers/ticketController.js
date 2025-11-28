const ticketService = require('../services/ticketService');
const logger = require('../utils/logger');

// 取票
const getTicket = async (req, res) => {
  try {
    const { businessTypeId } = req.body;
    
    if (!businessTypeId) {
      return res.status(400).json({ message: '业务类型ID不能为空' });
    }

    const ticketInfo = await ticketService.createTicket(businessTypeId);
    res.status(200).json(ticketInfo);
  } catch (error) {
    logger.error('取票失败:', error);
    res.status(500).json({ message: '取票失败', error: error.message });
  }
};

// 获取特定业务类型的等待人数
const getWaitingCountForBusinessType = async (req, res) => {
  try {
    const { businessTypeId } = req.params;
    const waitingCount = await ticketService.getWaitingCount(businessTypeId);
    res.status(200).json({ waiting_count: waitingCount });
  } catch (error) {
    logger.error('获取等待人数失败:', error);
    res.status(500).json({ message: '获取等待人数失败', error: error.message });
  }
};

// 批量获取所有业务类型的等待人数
const getAllWaitingCounts = async (req, res) => {
  try {
    const waitingCounts = await ticketService.getAllWaitingCounts();
    res.status(200).json(waitingCounts);
  } catch (error) {
    logger.error('批量获取等待人数失败:', error);
    res.status(500).json({ message: '批量获取等待人数失败', error: error.message });
  }
};

// 叫号：处理下一个票号
const callNext = async (req, res) => {
  try {
    const { businessTypeId, counterNumber } = req.body;
    
    if (!businessTypeId || !counterNumber) {
      return res.status(400).json({ message: '业务类型ID和柜台号不能为空' });
    }

    const result = await ticketService.callNext(businessTypeId, counterNumber);
    res.status(200).json(result);
  } catch (error) {
    logger.error('叫号失败:', error);
    res.status(500).json({ message: '叫号失败', error: error.message });
  }
};

module.exports = {
  getTicket,
  getWaitingCountForBusinessType,
  getAllWaitingCounts,
  callNext
};
