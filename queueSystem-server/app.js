const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const routes = require('./routes');
const { getExternalPicPath } = require('./utils/getExternalPicPath');
const logger = require('./utils/logger');

const app = express();

// 中间件
app.set('trust proxy', true);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API路由
app.use('/api', routes);

// 外部图片目录服务（优先级高于打包内的图片）
// 如果可执行文件同目录下有 pic 文件夹，优先使用该文件夹中的图片
// 注意：pic 目录保留在可执行文件外部，方便用户自定义更改图片
// 注意：必须在默认静态文件服务之前注册，以确保外部图片优先
const externalPicPath = getExternalPicPath();
if (externalPicPath) {
  logger.info(`使用外部图片目录: ${externalPicPath}`);
  logger.info(`提示: 您可以在该目录中放置自定义图片文件`);
  // 为 /pic 路径提供外部图片目录的静态文件服务
  app.use('/pic', express.static(externalPicPath));
} else {
  // 如果没有外部目录，使用打包内的 public/pic 目录（默认图片）
  const defaultPicPath = path.join(__dirname, 'public', 'pic');
  if (fs.existsSync(defaultPicPath)) {
    logger.info(`使用打包内的默认图片目录: ${defaultPicPath}`);
    logger.info(`提示: 如需自定义图片，请在可执行文件同目录下创建 pic 文件夹`);
    app.use('/pic', express.static(defaultPicPath));
  } else {
    logger.warn('未找到图片目录（外部和打包内都不存在）');
  }
}

// 获取 public 目录路径（支持打包环境）
function getPublicPath() {
  const isPacked = typeof process.pkg !== 'undefined';
  
  if (isPacked) {
    // 打包环境：优先使用打包内的 public 目录（快照目录）
    const snapshotPublicPath = path.join(__dirname, 'public');
    
    // 检查打包内的 public 目录是否存在
    if (fs.existsSync(snapshotPublicPath)) {
      // 验证关键文件是否存在
      const indexHtmlPath = path.join(snapshotPublicPath, 'index.html');
      if (fs.existsSync(indexHtmlPath)) {
        logger.info('使用打包内的 public 目录');
        return snapshotPublicPath;
      } else {
        logger.warn('打包内的 public 目录存在，但缺少 index.html');
      }
    } else {
      logger.warn('打包内的 public 目录不存在，尝试使用外部目录');
    }
    
    // 如果打包内的文件不存在，尝试使用外部 public 目录（备用方案）
    const execPath = process.execPath;
    const execDir = path.dirname(execPath);
    const externalPublicPath = path.join(execDir, 'public');
    
    if (fs.existsSync(externalPublicPath)) {
      logger.warn('使用外部 public 目录（备用方案）');
      return externalPublicPath;
    }
    
    // 如果都不存在，返回快照路径（让程序尝试访问，如果失败会有明确的错误信息）
    logger.error('无法找到 public 目录');
    return snapshotPublicPath;
  } else {
    // 开发环境：使用项目目录下的 public
    return path.join(__dirname, 'public');
  }
}

const publicPath = getPublicPath();

// 静态文件服务 - 前端构建文件将放在这里
// 注意：这个中间件会处理所有未匹配的静态文件请求
app.use(express.static(publicPath));

// SQLite数据库管理界面路由
app.get('/adminer', (req, res) => {
  res.redirect('/adminer/');
});
app.get('/adminer/', (req, res) => {
  res.sendFile(path.join(publicPath, 'adminer', 'index.html'));
});

// SPA模式 - 处理前端路由
// 处理所有前端路由
app.use((req, res, next) => {
  // 排除API路径和Socket.IO路径
  // 注意：/admin 路径用于前端的管理员界面，而 /api/admin 用于后端数据库管理API
  if (
    (!req.path.startsWith('/api') && !req.path.startsWith('/socket.io')) ||
    (req.path.startsWith('/admin/') && !req.path.startsWith('/api/admin/'))
  ) {
    // console.log('将请求转发到前端路由:', req.path);
    const indexHtmlPath = path.join(publicPath, 'index.html');
    
    // 检查文件是否存在，如果不存在，尝试外部路径
    if (!fs.existsSync(indexHtmlPath)) {
      const isPacked = typeof process.pkg !== 'undefined';
      if (isPacked) {
        // 尝试使用外部 public 目录
        const execPath = process.execPath;
        const execDir = path.dirname(execPath);
        const externalPublicPath = path.join(execDir, 'public');
        const externalIndexHtml = path.join(externalPublicPath, 'index.html');
        
        if (fs.existsSync(externalIndexHtml)) {
          logger.warn(`使用外部 public/index.html: ${externalIndexHtml}`);
          return res.sendFile(externalIndexHtml);
        } else {
          logger.error(`无法找到 index.html`, {
            packedPath: indexHtmlPath,
            externalPath: externalIndexHtml
          });
          return res.status(500).send('前端文件未找到，请检查 public 目录是否正确打包或放置在可执行文件同目录下');
        }
      }
    }
    
    res.sendFile(indexHtmlPath);
  } else {
    next();
  }
});

// 错误处理中间件
app.use((err, req, res, next) => {
  logger.error('Express 错误处理中间件捕获的错误', err);
  res.status(500).json({
    success: false,
    message: '服务器内部错误',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

module.exports = app;
