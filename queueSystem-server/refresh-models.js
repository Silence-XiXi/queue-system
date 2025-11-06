const { exec } = require('child_process');
const path = require('path');

// 先运行清理脚本
console.log('清理旧模型文件...');
exec('node clean-models.js', (err, stdout, stderr) => {
  if (err) {
    console.error('清理脚本执行失败:', err);
    return;
  }
  
  console.log(stdout);
  
  // 然后生成新模型
  console.log('生成新模型...');
  exec('node generate-models-auto.js', (err, stdout, stderr) => {
    if (err) {
      console.error('生成模型失败:', err);
      return;
    }
    
    console.log(stdout);
    console.log('模型刷新完成！');
  });
});