const cron = require('node-cron');
const { sequelize, settings, ticketSequences, counters, counterBusinessLastTicket } = require('../models');

/**
 * 每日重置定时任务
 * 从settings表读取ticket_reset_time，每天在指定时间执行重置操作
 */
class DailyResetScheduler {
  constructor() {
    this.cronJob = null; // 定时任务
    this.isRunning = false;
    this.currentCronExpression = null; // 记录当前的 cron 表达式
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
        console.warn('未找到 ticket_reset_time 设置，使用默认时间 00:00');
        return '00:00';
      }

      return setting.value.trim();
    } catch (error) {
      console.error('读取重置时间失败:', error);
      return '00:00'; // 默认时间
    }
  }

  /**
   * 执行重置操作
   */
  async performReset() {
    console.log('开始执行每日重置任务...');

    try {
      const today = new Date().toISOString().split('T')[0]; // 格式：YYYY-MM-DD

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

        console.log('每日重置任务执行成功');
        console.log(`- 重置日期: ${today}`);
        console.log('- ticket_sequences 表的 current_total_number 和 current_passed_number 已重置为 0');
        console.log('- ticket_sequences 表的 date 已更新为当前日期');
        console.log('- counters 表的 current_ticket_number 已清空');
        console.log('- counter_business_last_ticket 表的 last_ticket_no 已清空');
      });
    } catch (error) {
      console.error('执行每日重置任务失败:', error);
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
      console.error('时间格式转换失败:', error);
      return '0 0 * * *'; // 默认：每天 00:00
    }
  }

  /**
   * 启动定时任务
   */
  async start() {
    if (this.isRunning) {
      console.log('定时任务已在运行中');
      return;
    }

    try {
      // 获取重置时间
      const resetTime = await this.getResetTime();
      const cronExpression = this.timeToCronExpression(resetTime);

      console.log(`设置每日重置任务，执行时间: ${resetTime} (cron: ${cronExpression})`);

      // 停止旧的定时任务（如果存在）
      if (this.cronJob) {
        this.cronJob.stop();
      }

      // 创建新的定时任务
      // 注意：node-cron 的时区功能可能在某些环境下不工作
      // 我们使用两种方式：1. 尝试使用时区功能 2. 如果失败，使用本地时间+时差计算
      let cronOptions = {
        scheduled: true
      };

      // 尝试使用时区功能（在某些环境下可能不工作）
      try {
        cronOptions.timezone = 'Asia/Shanghai';
      } catch (e) {
        console.warn('时区设置可能不支持，将使用本地时间计算');
      }

      this.cronJob = cron.schedule(cronExpression, async () => {
        const now = new Date();
        const shanghaiTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
        console.log(`========== 定时任务触发 ==========`);
        console.log(`触发时间（上海）: ${shanghaiTime.toLocaleString('zh-CN')}`);
        console.log(`系统时间: ${now.toLocaleString()}`);
        console.log(`UTC时间: ${now.toUTCString()}`);
        console.log(`Cron表达式: ${cronExpression}`);
        try {
          await this.performReset();
          console.log(`========== 定时任务执行完成 ==========`);
        } catch (error) {
          console.error(`========== 定时任务执行失败 ==========`);
          console.error('错误详情:', error);
          console.error('错误堆栈:', error.stack);
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
            console.log(`定时任务下一次执行时间（预计）: ${nextRunTime.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
          }
        }
      } catch (e) {
        console.warn('无法获取下一次执行时间:', e.message);
      }

      // 输出当前时间信息用于调试
      const now = new Date();
      const shanghaiTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
      console.log(`当前系统时间: ${now.toLocaleString()}`);
      console.log(`当前上海时间: ${shanghaiTime.toLocaleString('zh-CN')}`);
      console.log(`定时任务将在每天 ${resetTime} (上海时间) 执行`);

      this.currentCronExpression = cronExpression; // 保存当前的 cron 表达式
      this.isRunning = true;
      console.log('每日重置定时任务已启动');

      // 监听 settings 表的变化，如果重置时间改变，重新启动定时任务
      this.setupSettingsWatcher();
    } catch (error) {
      console.error('启动定时任务失败:', error);
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
          console.log('检测到重置时间设置已更改，重新启动定时任务...');
          await this.restart();
        }
      } catch (error) {
        console.error('检查设置变化失败:', error);
      }
    }, 5 * 60 * 1000); // 每5分钟检查一次
  }

  /**
   * 停止定时任务
   */
  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
    }
    this.currentCronExpression = null;
    this.isRunning = false;
    console.log('每日重置定时任务已停止');
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
    console.log('手动触发重置任务...');
    await this.performReset();
  }

  /**
   * 获取定时任务状态信息（用于调试）
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      currentCronExpression: this.currentCronExpression,
      hasCronJob: !!this.cronJob,
      nextRunTime: this.cronJob && this.cronJob.nextDates ? this.cronJob.nextDates()[0] : null
    };
  }

  /**
   * 测试定时任务（立即执行一次，用于验证功能）
   */
  async testSchedule() {
    console.log('========== 测试定时任务 ==========');
    console.log('当前状态:', this.getStatus());
    try {
      const resetTime = await this.getResetTime();
      const cronExpression = this.timeToCronExpression(resetTime);
      console.log(`重置时间设置: ${resetTime}`);
      console.log(`Cron表达式: ${cronExpression}`);
      console.log('执行测试重置...');
      await this.performReset();
      console.log('========== 测试完成 ==========');
    } catch (error) {
      console.error('========== 测试失败 ==========');
      console.error('错误详情:', error);
      throw error;
    }
  }
}

// 创建单例实例
const scheduler = new DailyResetScheduler();

module.exports = scheduler;

