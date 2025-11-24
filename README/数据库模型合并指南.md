# 数据库模型合并指南

此文件提供将Navicat修改后的数据库结构（通过反向工程生成的模型）与原始模型文件合并的建议。

## 合并步骤

1. 对比每个表的字段定义
2. 保留原始模型中的注释、默认值和特殊设置
3. 确保关联关系的定义正确

## 示例合并 - Counter模型

原始模型：
```javascript
// 窗口表(counters)
const Counter = sequelize.define('counter', {
  counter_number: { 
    type: DataTypes.INTEGER, 
    allowNull: false,
    unique: true,
    comment: '窗口號(1-6)'
  },
  name: { 
    type: DataTypes.STRING(50),
    comment: '窗口名稱'
  },
  status: { 
    type: DataTypes.STRING(20), 
    defaultValue: 'closed',
    comment: '窗口狀態(available/busy/closed)'
  },
  device_id: { 
    type: DataTypes.STRING(100),
    comment: '設備標識'
  }
}, {
  comment: '窗口表',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});
```

生成的模型：
```javascript
class counters extends Sequelize.Model {
  static init(sequelize, DataTypes) {
  return super.init({
    id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: true,
      primaryKey: true
    },
    counterNumber: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
      field: 'counter_number'
    },
    name: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    ipAddress: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'ip_address'
    },
    currentTicketNumber: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'current_ticket_number'
    }
  }, {
    sequelize,
    tableName: 'counters',
    timestamps: true,
    // ...
  });
  }
}
```

合并后：
```javascript
// 窗口表(counters)
const Counter = sequelize.define('counter', {
  counter_number: { 
    type: DataTypes.INTEGER, 
    allowNull: false,
    unique: true,
    comment: '窗口號(1-6)'
  },
  name: { 
    type: DataTypes.STRING(50),
    comment: '窗口名稱'
  },
  status: { 
    type: DataTypes.STRING(20), 
    defaultValue: 'closed',
    comment: '窗口狀態(available/busy/closed)'
  },
  device_id: { 
    type: DataTypes.STRING(100),
    comment: '設備標識'
  },
  // 从生成的模型添加的新字段
  ip_address: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: '設備IP地址'
  },
  current_ticket_number: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: '當前票號'
  }
}, {
  comment: '窗口表',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});
```

## 关联关系

确保从`generated-models/init-models.js`中复制任何新的或修改过的关联关系到原始模型文件中。

## 完成后的操作

合并完成后，修改`server/index.js`中的以下代码：

```javascript
// 使用 alter: true 可以安全地更新表结构而不删除数据
await sequelize.sync({ alter: true });
```

如果你想让Sequelize不自动修改表结构，可以改为：

```javascript
// 不自动修改表结构
await sequelize.sync({ alter: false });
```

或者在开发环境中保持alter为true，但在生产环境中禁用：

```javascript
if (process.env.NODE_ENV === 'development') {
  // 开发环境中允许更新表结构
  await sequelize.sync({ alter: true });
} else {
  // 生产环境中不自动更新表结构
  await sequelize.sync({ alter: false });
}
```
