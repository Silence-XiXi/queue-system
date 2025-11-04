const { TicketSequence, sequelize } = require('../models');
const { Op } = require('sequelize');

// 获取下一个序列号
const getNextSequenceNumber = async (businessTypeId) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const transaction = await sequelize.transaction();
  
  try {
    // 查找或创建今天的序列记录
    const [sequence, created] = await TicketSequence.findOrCreate({
      where: {
        businessTypeId,
        date: today
      },
      defaults: {
        current_number: 0,
        businessTypeId,
        date: today
      },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    
    // 递增序列号
    sequence.current_number += 1;
    await sequence.save({ transaction });
    
    await transaction.commit();
    
    return sequence.current_number;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

module.exports = {
  getNextSequenceNumber
};
