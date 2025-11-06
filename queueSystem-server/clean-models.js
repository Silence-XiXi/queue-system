const fs = require('fs');
const path = require('path');

const modelsDir = path.join(__dirname, 'generated-models-auto');

// 保留init-models.js之外的所有文件
fs.readdir(modelsDir, (err, files) => {
  if (err) {
    console.error('读取目录失败:', err);
    return;
  }
  
  files.forEach(file => {
    if (file !== 'init-models.js' && file.endsWith('.js')) {
      fs.unlink(path.join(modelsDir, file), err => {
        if (err) {
          console.error(`删除文件 ${file} 失败:`, err);
        } else {
          console.log(`已删除文件: ${file}`);
        }
      });
    }
  });
});