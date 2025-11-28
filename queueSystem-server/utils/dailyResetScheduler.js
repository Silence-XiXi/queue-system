const cron = require('node-cron');
const { sequelize, settings, ticketSequences, counters, counterBusinessLastTicket } = require('../models');
const { getIO } = require('../websocket');
const logger = require('./logger');

/**
 * 每日重置定时任务
 * 从settings表读取ticket_reset_time，每天在指定时间执行重置操作
 */
class DailyResetScheduler {
  constructor() {
    this.cronJob = null; // 定时任务
    this.isRunning = false;
    this.currentCronExpression = null; // 记录当前的 cron 表达式
    this.healthCheckInterval = null; // 健康检查定时器
    this.lastExecutionTime = null; // 上次执行时间
    this.expectedNextExecution = null; // 预期下次执行时间
  }

  /**
   * 获取重置时间（从settings表）
   */
  async getResetTime() {
    try {
      const setting = await settings.findOne({
        where: { key: 'ticket_reset_time' }
      });

      if (!setting || !setting.value) {
        logger.warn('未找到 ticket_reset_time 设置，使用默认时间 00:00');
        return '00:00';
      }

      return setting.value.trim();
    } catch (error) {
      logger.error('读取重置时间失败:', error);
      return '00:00'; // 默认时间
    }
  }

  /**
   * 执行重置操作
   */
  async performReset() {
    logger.info('开始执行每日重置任务...');

    try {
      // 使用本地时区获取今天的日期，避免 UTC 时区问题
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const today = `${year}-${month}-${day}`; // 格式：YYYY-MM-DD（本地时区）

      // 开始事务
      await sequelize.transaction(async (t) => {
        // 1. 重置 ticket_sequences 表
        // 由于有唯一约束 UNIQUE (business_type_id, date)，我们需要：
        // - 对于今天已有的记录，重置数值为0
        // - 对于旧记录，更新 date 为今天（但要避免唯一约束冲突）
        // - 删除多余的旧记录

        // 先重置今天已有的所有记录
        await sequelize.query(
          `UPDATE ticket_sequences 
            SET current_total_number = 0, 
                current_passed_number = 0,
                updated_at = datetime('now')
            WHERE date = :today`,
          {
            replacements: { today },
            transaction: t
          }
        );

        // 获取所有业务类型ID（包括今天没有记录的）
        const [allBusinessTypes] = await sequelize.query(
          `SELECT DISTINCT business_type_id FROM ticket_sequences`,
          { transaction: t }
        );

        // 对于每个业务类型，确保今天有一条记录
        for (const bt of allBusinessTypes) {
          const businessTypeId = bt.business_type_id;

          // 检查今天是否已有记录
          const [todayRecords] = await sequelize.query(
            `SELECT id FROM ticket_sequences 
              WHERE business_type_id = :businessTypeId AND date = :today`,
            {
              replacements: { businessTypeId, today },
              transaction: t
            }
          );

          if (todayRecords.length === 0) {
            // 今天没有记录，找到该业务类型的一条旧记录
            const [oldRecords] = await sequelize.query(
              `SELECT id FROM ticket_sequences 
                WHERE business_type_id = :businessTypeId AND date != :today
                ORDER BY date DESC LIMIT 1`,
              {
                replacements: { businessTypeId, today },
                transaction: t
              }
            );

            if (oldRecords.length > 0) {
              // 更新旧记录的 date 为今天，并重置数值
              await sequelize.query(
                `UPDATE ticket_sequences 
                  SET current_total_number = 0, 
                      current_passed_number = 0,
                      date = :today,
                      updated_at = datetime('now')
                  WHERE id = :id`,
                {
                  replacements: { today, id: oldRecords[0].id },
                  transaction: t
                }
              );
            }
          }

          // 删除该业务类型的其他旧记录（保留今天的一条）
          await sequelize.query(
            `DELETE FROM ticket_sequences 
              WHERE business_type_id = :businessTypeId AND date != :today`,
            {
              replacements: { businessTypeId, today },
              transaction: t
            }
          );
        }

        // 2. 清空 counters 表的所有记录的 current_ticket_number 字段
        await counters.update(
          { current_ticket_number: null },
          {
            where: {},
            transaction: t
          }
        );

        // 3. 清空 counter_business_last_ticket 表的所有记录的 last_ticket_no 字段
        await counterBusinessLastTicket.update(
          { last_ticket_no: null },
          {
            where: {},
            transaction: t
          }
        );

        logger.info('每日重置任务执行成功', {
          resetDate: today,
          operations: [
            'ticket_sequences 表的 current_total_number 和 current_passed_number 已重置为 0',
            'ticket_sequences 表的 date 已更新为当前日期',
            'counters 表的 current_ticket_number 已清空',
            'counter_business_last_ticket 表的 last_ticket_no 已清空'
          ]
        });
        
        // 通过 WebSocket 通知所有客户端重置已完成
        try {
          const io = getIO();
          if (io) {
            io.emit('ticket:dailyReset', {
              date: today,
              timestamp: new Date().toISOString()
            });
            logger.info('已发送重置完成事件通知所有客户端');
          }
        } catch (error) {
          logger.warn('发送重置事件通知失败（不影响重置功能）:', error);
        }
      });
    } catch (error) {
      logger.error('执行每日重置任务失败:', error);
      throw error;
    }
  }

  /**
   * 将时间字符串（如 "00:00" 或 "23:59"）转换为 cron 表达式
   */
  timeToCronExpression(timeString) {
    try {
      const [hours, minutes] = timeString.split(':').map(Number);

      if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        throw new Error(`无效的时间格式: ${timeString}`);
      }

      // cron 格式: 分钟 小时 日 月 星期
      // 每天在指定时间执行
      return `${minutes} ${hours} * * *`;
    } catch (error) {
      logger.error('时间格式转换失败:', error);
      return '0 0 * * *'; // 默认：每天 00:00
    }
  }

  /**
   * 启动定时任务
   */
  async start() {
    if (this.isRunning) {
      logger.info('定时任务已在运行中');
      return;
    }

    try {
      // 获取重置时间
      const resetTime = await this.getResetTime();
      const cronExpression = this.timeToCronExpression(resetTime);

      logger.info(`设置每日重置任务，执行时间: ${resetTime} (cron: ${cronExpression})`);

      // 停止旧的定时任务（如果存在）
      if (this.cronJob) {
        this.cronJob.stop();
      }

      // 创建新的定时任务
      // 注意：node-cron 的时区功能可能在某些环境下不工作
      // 我们使用两种方式：1. 尝试使用时区功能 2. 如果失败，使用本地时间+时差计算
      let cronOptions = {
        scheduled: true,
        timezone: 'Asia/Shanghai'  // 明确设置时区
      };

      // 验证时区是否支持
      try {
        // 测试时区是否有效
        const testDate = new Date();
        const shanghaiTimeStr = testDate.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' });
        if (!shanghaiTimeStr) {
          throw new Error('时区转换失败');
        }
        logger.info(`时区设置: Asia/Shanghai (已启用)`);
      } catch (e) {
        logger.warn('时区设置可能不支持，将使用本地时间计算');
        // 如果时区不支持，移除时区选项，使用系统本地时间
        delete cronOptions.timezone;
      }

      // 记录定时任务创建信息
      const currentTime = new Date();
      const currentShanghaiTime = new Date(currentTime.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
      logger.info('定时任务创建信息', {
        systemTime: currentTime.toLocaleString(),
        shanghaiTime: currentShanghaiTime.toLocaleString('zh-CN'),
        timezoneOffset: `${-currentTime.getTimezoneOffset() / 60} 小时`
      });

      this.cronJob = cron.schedule(cronExpression, async () => {
        const now = new Date();
        const shanghaiTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
        this.lastExecutionTime = now; // 记录执行时间
        
        logger.info('定时任务触发', {
          shanghaiTime: shanghaiTime.toLocaleString('zh-CN'),
          systemTime: now.toLocaleString(),
          utcTime: now.toUTCString(),
          cronExpression,
          timezone: cronOptions.timezone || '系统本地时间'
        });
        try {
          await this.performReset();
          logger.info('定时任务执行完成');
          
          // 更新预期下次执行时间
          this.calculateNextExecutionTime(resetTime);
        } catch (error) {
          logger.error('定时任务执行失败', error);
        }
      }, cronOptions);

      // 验证定时任务是否已正确创建
      if (!this.cronJob) {
        throw new Error('定时任务创建失败');
      }

      // 输出下一次执行时间（如果可用）
      try {
        if (this.cronJob && typeof this.cronJob.nextDates === 'function') {
          const nextRun = this.cronJob.nextDates();
          if (nextRun && nextRun.length > 0) {
            const nextRunTime = nextRun[0];
            logger.info(`定时任务下一次执行时间（预计）: ${nextRunTime.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
          }
        }
      } catch (e) {
        logger.warn('无法获取下一次执行时间:', e);
      }

      // 输出当前时间信息用于调试（已在上面输出，这里不再重复）
      logger.info(`定时任务将在每天 ${resetTime} (上海时间) 执行`);

      this.currentCronExpression = cronExpression; // 保存当前的 cron 表达式
      this.isRunning = true;
      logger.info('每日重置定时任务已启动');

      // 计算预期下次执行时间
      this.calculateNextExecutionTime(resetTime);

      // 监听 settings 表的变化，如果重置时间改变，重新启动定时任务
      this.setupSettingsWatcher();

      // 启动健康检查机制
      this.startHealthCheck();
    } catch (error) {
      logger.error('启动定时任务失败:', error);
      throw error;
    }
  }

  /**
   * 设置 settings 表监听器，当 ticket_reset_time 改变时重新启动定时任务
   */
  setupSettingsWatcher() {
    // 每5分钟检查一次设置是否改变
    setInterval(async () => {
      try {
        const resetTime = await this.getResetTime();
        const newCronExpression = this.timeToCronExpression(resetTime);

        // 如果 cron 表达式改变，重新启动定时任务
        if (this.currentCronExpression && this.currentCronExpression !== newCronExpression) {
          logger.info('检测到重置时间设置已更改，重新启动定时任务...');
          await this.restart();
        }
      } catch (error) {
        logger.error('检查设置变化失败:', error);
      }
    }, 5 * 60 * 1000); // 每5分钟检查一次
  }

  /**
   * 计算预期下次执行时间
   */
  calculateNextExecutionTime(resetTime) {
    try {
      const [hours, minutes] = resetTime.split(':').map(Number);
      const now = new Date();
      const shanghaiTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
      
      // 创建今天的执行时间
      const todayExecution = new Date(shanghaiTime);
      todayExecution.setHours(hours, minutes, 0, 0);
      
      // 如果今天的时间已过，则设置为明天
      if (todayExecution <= shanghaiTime) {
        todayExecution.setDate(todayExecution.getDate() + 1);
      }
      
      this.expectedNextExecution = todayExecution;
      logger.info(`预期下次执行时间: ${todayExecution.toLocaleString('zh-CN')}`);
    } catch (error) {
      logger.warn('计算下次执行时间失败:', error);
    }
  }

  /**
   * 启动健康检查机制
   * 定期检查定时任务是否正常运行，如果发现问题则重新启动
   */
  startHealthCheck() {
    // 清除旧的健康检查
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // 每30分钟检查一次
    this.healthCheckInterval = setInterval(async () => {
      try {
        // 检查定时任务是否还在运行
        if (!this.isRunning || !this.cronJob) {
          logger.warn('检测到定时任务未运行，尝试重新启动...');
          await this.restart();
          return;
        }

        // 检查定时任务是否被停止
        if (this.cronJob && typeof this.cronJob.running === 'function' && !this.cronJob.running()) {
          logger.warn('检测到定时任务已停止，尝试重新启动...');
          await this.restart();
          return;
        }

        // 如果预期执行时间已过，但任务没有执行，记录警告
        if (this.expectedNextExecution && new Date() > this.expectedNextExecution) {
          const overdueMinutes = Math.floor((new Date() - this.expectedNextExecution) / 1000 / 60);
          if (overdueMinutes > 5 && !this.lastExecutionTime) {
            logger.warn(`警告: 定时任务预期执行时间已过 ${overdueMinutes} 分钟，但未检测到执行记录`);
            logger.warn('如果任务确实未执行，请检查服务器日志或手动触发重置');
          }
        }

        // 正常状态日志（每小时记录一次）
        const now = new Date();
        if (now.getMinutes() === 0) {
          logger.info(`定时任务健康检查: 运行正常 (${now.toLocaleString('zh-CN')})`);
        }
      } catch (error) {
        logger.error('健康检查失败:', error);
      }
    }, 30 * 60 * 1000); // 每30分钟检查一次

    logger.info('定时任务健康检查机制已启动');
  }

  /**
   * 停止健康检查
   */
  stopHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * 停止定时任务
   */
  stop() {
    // 停止健康检查
    this.stopHealthCheck();

    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
    }
    this.currentCronExpression = null;
    this.isRunning = false;
    this.lastExecutionTime = null;
    this.expectedNextExecution = null;
    logger.info('每日重置定时任务已停止');
  }

  /**
   * 重启定时任务
   */
  async restart() {
    this.stop();
    await this.start();
  }

  /**
   * 手动触发重置（用于测试）
   */
  async manualReset() {
    logger.info('手动触发重置任务...');
    await this.performReset();
  }

  /**
   * 获取定时任务状态信息（用于调试）
   */
  getStatus() {
    const now = new Date();
    const shanghaiTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
    
    let nextRunTime = null;
    try {
      if (this.cronJob && typeof this.cronJob.nextDates === 'function') {
        const nextDates = this.cronJob.nextDates();
        if (nextDates && nextDates.length > 0) {
          nextRunTime = nextDates[0];
        }
      }
    } catch (e) {
      // 忽略错误
    }

    return {
      isRunning: this.isRunning,
      currentCronExpression: this.currentCronExpression,
      hasCronJob: !!this.cronJob,
      cronJobRunning: this.cronJob && typeof this.cronJob.running === 'function' ? this.cronJob.running() : null,
      nextRunTime: nextRunTime,
      expectedNextExecution: this.expectedNextExecution,
      lastExecutionTime: this.lastExecutionTime,
      currentSystemTime: now.toISOString(),
      currentShanghaiTime: shanghaiTime.toISOString(),
      healthCheckActive: !!this.healthCheckInterval
    };
  }

  /**
   * 测试定时任务（立即执行一次，用于验证功能）
   */
  async testSchedule() {
    logger.info('========== 测试定时任务 ==========');
    logger.info('当前状态:', this.getStatus());
    try {
      const resetTime = await this.getResetTime();
      const cronExpression = this.timeToCronExpression(resetTime);
      logger.info(`重置时间设置: ${resetTime}`);
      logger.info(`Cron表达式: ${cronExpression}`);
      logger.info('执行测试重置...');
      await this.performReset();
      logger.info('========== 测试完成 ==========');
    } catch (error) {
      logger.error('========== 测试失败 ==========');
      logger.error('错误详情:', error);
      throw error;
    }
  }
}

// 创建单例实例
const scheduler = new DailyResetScheduler();

module.exports = scheduler;

