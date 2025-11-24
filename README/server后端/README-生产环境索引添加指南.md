# 生产环境数据库索引添加指南

## 📋 概述

本文档说明如何在生产环境中安全地添加数据库索引，以提升系统查询性能。

## ⚠️ 重要提示

1. **备份数据库**：在添加索引前，必须备份数据库
2. **选择时机**：在业务低峰期执行（如夜间或非营业时间）
3. **监控影响**：索引创建过程会对表加锁，可能短暂影响查询性能
4. **测试验证**：建议先在测试环境验证

## 📦 需要添加的索引

以下索引用于优化系统性能：

1. **counter_business_last_ticket 表**
   - `idx_counter_business_last_ticket_business_type_id` - 单列索引
   - `idx_counter_business_last_ticket_counter_id` - 单列索引
   - `idx_counter_business_last_ticket_composite` - 复合索引

2. **counters 表**
   - `idx_counters_ip_address` - IP地址查询索引

3. **ticket_sequences 表**
   - `idx_ticket_sequences_business_type_date` - 复合索引（可能已存在）

## 🚀 执行步骤

### 方法一：使用独立脚本（推荐）

#### 步骤 1: 备份数据库

```bash
# 进入服务器目录
cd queueSystem-server

# 执行备份脚本
node scripts/backup-database.js
```

备份文件将保存在 `backups/` 目录下，文件名格式：`database-backup-YYYY-MM-DDTHH-MM-SS.sqlite`

#### 步骤 2: 停止服务（可选但推荐）

```bash
# Windows (如果使用服务)
net stop QueueSystem

# 或直接关闭运行中的进程
```

#### 步骤 3: 添加索引

```bash
# 执行索引添加脚本
node scripts/add-indexes-production.js
```

脚本会：
- 检查每个索引是否已存在
- 只添加不存在的索引
- 显示详细的执行日志
- 输出统计信息

#### 步骤 4: 验证索引

```bash
# 使用 SQLite 命令行工具验证
sqlite3 database.sqlite ".indices counter_business_last_ticket"
sqlite3 database.sqlite ".indices counters"
sqlite3 database.sqlite ".indices ticket_sequences"
```

#### 步骤 5: 重启服务

```bash
# Windows (如果使用服务)
net start QueueSystem

# 或重新启动应用程序
```

### 方法二：通过服务器启动自动添加

如果服务器配置为生产环境（`NODE_ENV=production`），索引会在服务器启动时自动添加。

**注意**：这种方式会在每次启动时检查并添加缺失的索引，但不会影响已存在的索引。

```bash
# 设置环境变量
set NODE_ENV=production

# 启动服务器
node index.js
```

## 🔍 验证索引是否添加成功

### 方法一：查看脚本输出

脚本执行成功后会显示：
```
✅ 索引 idx_counter_business_last_ticket_business_type_id 添加成功
✅ 索引 idx_counter_business_last_ticket_counter_id 添加成功
...
```

### 方法二：使用 SQLite 命令行

```bash
# 查看所有索引
sqlite3 database.sqlite "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%';"

# 查看特定表的索引
sqlite3 database.sqlite ".indices counter_business_last_ticket"
```

### 方法三：通过代码验证

```javascript
const { sequelize } = require('./models');

async function checkIndexes() {
  const [results] = await sequelize.query(`
    SELECT name FROM sqlite_master 
    WHERE type='index' AND name LIKE 'idx_%'
    ORDER BY name
  `);
  console.log('已添加的索引:', results.map(r => r.name));
}
```

## 📊 性能影响评估

### 索引创建时间

- **小数据量** (< 10,000 条记录): 通常 < 1 秒
- **中等数据量** (10,000 - 100,000 条): 通常 1-5 秒
- **大数据量** (> 100,000 条): 可能需要 5-30 秒

### 对业务的影响

- **创建索引时**：表会被锁定，相关查询可能短暂延迟
- **索引创建后**：查询性能显著提升，写入性能略有下降（可忽略）

## 🔄 回滚方案

如果索引添加出现问题，可以：

### 方案一：删除索引

```sql
-- 使用 SQLite 命令行
sqlite3 database.sqlite

-- 删除索引
DROP INDEX IF EXISTS idx_counter_business_last_ticket_business_type_id;
DROP INDEX IF EXISTS idx_counter_business_last_ticket_counter_id;
DROP INDEX IF EXISTS idx_counter_business_last_ticket_composite;
DROP INDEX IF EXISTS idx_counters_ip_address;
DROP INDEX IF EXISTS idx_ticket_sequences_business_type_date;
```

### 方案二：恢复备份

```bash
# 停止服务
# 恢复备份文件
copy "backups\database-backup-YYYY-MM-DDTHH-MM-SS.sqlite" "database.sqlite"

# 重启服务
```

## 📝 检查清单

在执行索引添加前，请确认：

- [ ] 已备份数据库
- [ ] 已选择业务低峰期
- [ ] 已通知相关人员
- [ ] 已准备回滚方案
- [ ] 已测试脚本（如可能）

## 🆘 常见问题

### Q1: 索引添加失败怎么办？

**A**: 检查错误信息，通常是：
- 数据库文件权限问题
- 数据库文件被锁定（有其他进程在使用）
- 磁盘空间不足

### Q2: 索引已存在会怎样？

**A**: 脚本使用 `IF NOT EXISTS`，已存在的索引会被跳过，不会报错。

### Q3: 添加索引会影响现有数据吗？

**A**: 不会。索引只是数据结构，不会修改表中的数据。

### Q4: 可以分批添加索引吗？

**A**: 可以。可以修改脚本，只执行部分索引的添加。

## 📞 技术支持

如遇到问题，请：
1. 查看脚本输出的错误信息
2. 检查数据库文件是否正常
3. 确认数据库文件权限
4. 联系技术支持

## 📚 相关文档

- [性能优化建议.md](../README/server/性能优化建议.md)
- [数据库模型文档](./model-merge-guide.md)

