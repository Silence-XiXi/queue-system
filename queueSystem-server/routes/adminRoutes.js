const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');

// 中间件：验证管理员令牌
const verifyAdminToken = (req, res, next) => {
  const token = req.headers['admin-token'];
  
  if (!token) {
    return res.status(401).json({ message: '未提供管理员令牌' });
  }
  
  // 这里使用简单令牌验证，实际应用应使用更安全的方法如JWT
  try {
    const decodedToken = Buffer.from(token, 'base64').toString();
    if (!decodedToken.startsWith('admin_')) {
      return res.status(403).json({ message: '无效的管理员令牌' });
    }
    next();
  } catch (error) {
    return res.status(403).json({ message: '无效的管理员令牌' });
  }
};

// 公开路由
router.post('/login', adminController.login);

// 需要验证的路由
router.use(verifyAdminToken);

// 系统设置路由
router.get('/settings', adminController.getAllSettings);
router.put('/settings/:key', adminController.updateSetting);
router.post('/change-password', adminController.updateAdminPassword);

// 定时任务管理路由（用于调试和测试）
router.get('/scheduler/status', adminController.getSchedulerStatus);
router.post('/scheduler/test', adminController.testScheduler);
router.post('/scheduler/manual-reset', adminController.manualReset);

// 设备相关路由已移除

// 窗口管理路由
router.get('/counters', adminController.getAllCounters);
router.post('/counters', adminController.createCounter);
router.put('/counters/:id', adminController.updateCounter);
router.delete('/counters/:id', adminController.deleteCounter);

module.exports = router;
