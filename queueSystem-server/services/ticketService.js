const { ticketSequences, businessTypes, counters: Counter, counterBusinessLastTicket: CounterBusinessLastTicket, sequelize } = require('../models');
const { Op } = require('sequelize');
const { getIO } = require('../websocket');
const printerService = require('./printerService');
const logger = require('../utils/logger');

// 获取当前日期，格式为 YYYY-MM-DD
const getTodayDate = () => {
  const today = new Date();
  return today.toISOString().split('T')[0];
};

// 取票功能
const createTicket = async (businessTypeId) => {
  const today = getTodayDate();

  return sequelize.transaction(async (t) => {
    // 查找今天的票号序列
    let ticketSequence = await ticketSequences.findOne({
      where: {
        business_type_id: businessTypeId,
        date: today
      },
      transaction: t,
      lock: t.LOCK.UPDATE // 锁定行以防止并发问题
    });

    // 如果今天没有记录，则创建一条新记录
    if (!ticketSequence) {
      const businessType = await businessTypes.findByPk(businessTypeId, { transaction: t });
      if (!businessType) {
        throw new Error('业务类型不存在');
      }

      // 创建新的票号序列
      ticketSequence = await ticketSequences.create({
        business_type_id: businessTypeId,
        date: today,
        business_code: businessType.code,
        current_total_number: 0,
        current_passed_number: 0
      }, { transaction: t });
    }

    // 增加当前总票号
    await ticketSequence.increment('current_total_number', { transaction: t });
    
    // 重新加载以获取最新值
    await ticketSequence.reload({ transaction: t });

    // 获取业务类型信息
    const businessType = await businessTypes.findByPk(businessTypeId);

    // 生成票号（不使用短横线）
    const ticketNumber = `${businessType.prefix}${String(ticketSequence.current_total_number).padStart(3, '0')}`;
    
    // 计算等待人数（减去1，因为当前用户不算在等待人数中）
    const waitingCount = Math.max(0, ticketSequence.current_total_number - ticketSequence.current_passed_number - 1);

    const result = {
      ticket_number: ticketNumber,
      waiting_count: waitingCount,
      business_type_name: businessType.name,
      business_type_english_name: businessType.english_name,
      print_status: null, // 打印状态
      print_message: null // 打印消息
    };

    // 调用打印机打印票号
    try {
      const printResult = await printerService.printTicket({
        ticket_number: ticketNumber,
        business_type_name: businessType.name,
        business_type_english_name: businessType.english_name,
        waiting_count: waitingCount
      });
      
      // 将打印结果包含在返回数据中，供前端显示提示
      result.print_status = printResult.success ? 'success' : 'error';
      result.print_message = printResult.message;
      
      if (!printResult.success) {
        logger.warn('打印失败，但取票成功:', printResult.message);
        // 打印失败不影响取票流程，只记录警告
      }
    } catch (printError) {
      logger.error('打印票号时发生错误:', printError);
      // 打印错误不影响取票流程，但记录错误状态
      result.print_status = 'error';
      result.print_message = '打印時發生錯誤，請檢查打印機';
    }

    // 通过WebSocket广播取票事件，通知所有客户端刷新数据
    const io = getIO();
    if (io) {
      io.emit('ticket:created', {
        businessTypeId,
        ticketNumber,
        waitingCount,
        currentTotalNumber: ticketSequence.current_total_number,
        currentPassedNumber: ticketSequence.current_passed_number
      });
    }

    return result;
  });
};

// 获取等待人数
const getWaitingCount = async (businessTypeId) => {
  const today = getTodayDate();

  const ticketSequence = await ticketSequences.findOne({
    where: {
      business_type_id: businessTypeId,
      date: today
    }
  });

  if (!ticketSequence) {
    return 0; // 如果今天还没有取票记录，则等待人数为0
  }

  // 计算等待人数：current_total_number - current_passed_number
  return Math.max(0, ticketSequence.current_total_number - ticketSequence.current_passed_number);
};

// 批量获取所有业务类型的等待人数
// 优化版本：使用SQL JOIN一次性获取所有数据，减少数据库查询次数
const getAllWaitingCounts = async () => {
  const today = getTodayDate();
  
  // 使用优化的SQL查询，一次性获取所有业务类型及其等待人数
  const query = `
    SELECT 
      bt.id AS business_type_id,
      COALESCE(
        MAX(ts.current_total_number - ts.current_passed_number),
        0
      ) AS waiting_count
    FROM business_types bt
    LEFT JOIN ticket_sequences ts ON bt.id = ts.business_type_id AND ts.date = :today
    GROUP BY bt.id
  `;
  
  const results = await sequelize.query(query, {
    replacements: { today },
    type: sequelize.QueryTypes.SELECT
  });
  
  // 构建等待人数映射对象
  const waitingCounts = {};
  results.forEach(row => {
    waitingCounts[row.business_type_id] = Math.max(0, row.waiting_count || 0);
  });
  
  return waitingCounts;
};

// 叫号功能：处理下一个票号
const callNext = async (businessTypeId, counterNumber) => {
  const today = getTodayDate();

  return sequelize.transaction(async (t) => {
    // 1. 查找今天的票号序列并锁定
    let ticketSequence = await ticketSequences.findOne({
      where: {
        business_type_id: businessTypeId,
        date: today
      },
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    // 如果今天没有记录，则创建一条新记录
    if (!ticketSequence) {
      const businessType = await businessTypes.findByPk(businessTypeId, { transaction: t });
      if (!businessType) {
        throw new Error('业务类型不存在');
      }

      ticketSequence = await ticketSequences.create({
        business_type_id: businessTypeId,
        date: today,
        business_code: businessType.code,
        current_total_number: 0,
        current_passed_number: 0
      }, { transaction: t });
    }

    // 2. current_passed_number 自增1
    await ticketSequence.increment('current_passed_number', { transaction: t });
    await ticketSequence.reload({ transaction: t });

    // 3. 获取业务类型信息
    const businessType = await businessTypes.findByPk(businessTypeId, { transaction: t });
    if (!businessType) {
      throw new Error('业务类型不存在');
    }

    // 4. 生成新的票号：业务code + 三位的current_passed_number
    const newTicketNumber = `${businessType.code}${String(ticketSequence.current_passed_number).padStart(3, '0')}`;

    // 5. 根据柜台号查找柜台
    const counter = await Counter.findOne({
      where: { counter_number: counterNumber },
      transaction: t
    });

    if (!counter) {
      throw new Error('柜台不存在');
    }

    // 6. 更新counters表的current_ticket_number
    await counter.update({
      current_ticket_number: newTicketNumber
    }, { transaction: t });

    // 7. 更新或创建counter_business_last_ticket表的记录
    let lastTicket = await CounterBusinessLastTicket.findOne({
      where: {
        counter_id: counter.id,
        business_type_id: businessTypeId
      },
      transaction: t
    });

    if (lastTicket) {
      // 更新现有记录
      await lastTicket.update({
        last_ticket_no: newTicketNumber
      }, { transaction: t });
    } else {
      // 创建新记录
      await CounterBusinessLastTicket.create({
        counter_id: counter.id,
        business_type_id: businessTypeId,
        last_ticket_no: newTicketNumber
      }, { transaction: t });
    }

    // 8. 通过WebSocket广播叫号事件，通知所有客户端刷新数据
    const io = getIO();
    if (io) {
      io.emit('ticket:nextCalled', {
        businessTypeId,
        counterNumber,
        ticketNumber: newTicketNumber,
        currentPassedNumber: ticketSequence.current_passed_number,
        waitingCount: Math.max(0, ticketSequence.current_total_number - ticketSequence.current_passed_number)
      });
    }

    return {
      ticket_number: newTicketNumber,
      current_passed_number: ticketSequence.current_passed_number,
      waiting_count: Math.max(0, ticketSequence.current_total_number - ticketSequence.current_passed_number)
    };
  });
};

module.exports = {
  createTicket,
  getWaitingCount,
  getAllWaitingCounts,
  callNext
};
