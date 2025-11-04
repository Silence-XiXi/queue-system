const { Ticket, BusinessType, TicketSequence, sequelize } = require('../models');
const { getNextSequenceNumber } = require('../services/ticketService');
const { Op } = require('sequelize');

// 创建新票号
const createTicket = async (req, res) => {
  const { businessTypeId } = req.body;
  
  if (!businessTypeId) {
    return res.status(400).json({ message: '业务类型ID是必须的' });
  }
  
  try {
    // 获取业务类型信息
    const businessType = await BusinessType.findByPk(businessTypeId);
    if (!businessType) {
      return res.status(404).json({ message: '业务类型不存在' });
    }
    
    // 获取下一个序列号
    const sequenceNumber = await getNextSequenceNumber(businessTypeId);
    
    // 生成票号 (例如: A001)
    const paddedNumber = String(sequenceNumber).padStart(3, '0');
    const ticketNumber = `${businessType.prefix}${paddedNumber}`;
    
    // 创建票号
    const ticket = await Ticket.create({
      ticket_number: ticketNumber,
      sequence_number: sequenceNumber,
      businessTypeId: businessTypeId
    });
    
    res.status(201).json(ticket);
  } catch (error) {
    console.error('创建票号失败:', error);
    res.status(500).json({ message: '创建票号失败', error: error.message });
  }
};

// 获取当前排队情况
const getCurrentTickets = async (req, res) => {
  try {
    const tickets = await Ticket.findAll({
      where: {
        status: {
          [Op.in]: ['waiting', 'called']
        }
      },
      include: [{
        model: BusinessType,
        attributes: ['id', 'name', 'code', 'prefix']
      }],
      order: [
        ['created_at', 'ASC']
      ]
    });
    
    res.json(tickets);
  } catch (error) {
    console.error('获取当前票号失败:', error);
    res.status(500).json({ message: '获取当前票号失败', error: error.message });
  }
};

// 更新票号状态
const updateTicketStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  
  if (!status) {
    return res.status(400).json({ message: '状态是必须的' });
  }
  
  try {
    const ticket = await Ticket.findByPk(id);
    if (!ticket) {
      return res.status(404).json({ message: '票号不存在' });
    }
    
    // 根据状态设置相关时间戳
    const updates = { status };
    if (status === 'called') {
      updates.called_at = new Date();
    } else if (status === 'completed') {
      updates.completed_at = new Date();
    }
    
    await ticket.update(updates);
    
    res.json(ticket);
  } catch (error) {
    console.error('更新票号状态失败:', error);
    res.status(500).json({ message: '更新票号状态失败', error: error.message });
  }
};

module.exports = {
  createTicket,
  getCurrentTickets,
  updateTicketStatus
};
