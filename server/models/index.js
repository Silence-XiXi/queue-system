const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');

// 创建SQLite连接
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: path.join(__dirname, '../database.sqlite'),
  logging: false // 生产环境中禁用日志
});

// 业务类型表(business_types)
const BusinessType = sequelize.define('business_type', {
  name: { 
    type: DataTypes.STRING(50), 
    allowNull: false,
    comment: '業務類型名稱'
  },
  code: { 
    type: DataTypes.CHAR(1), 
    allowNull: false,
    unique: true,
    comment: '業務代碼(A-E)'
  },
  prefix: { 
    type: DataTypes.STRING(5), 
    allowNull: false,
    comment: '票號前綴'
  },
  status: { 
    type: DataTypes.STRING(10), 
    defaultValue: 'active',
    comment: '狀態(active/inactive)'
  }
}, {
  comment: '業務類型表',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

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

// 票号表(tickets)
const Ticket = sequelize.define('ticket', {
  ticket_number: { 
    type: DataTypes.STRING(10), 
    allowNull: false,
    unique: true,
    comment: '票號(如A001)'
  },
  sequence_number: { 
    type: DataTypes.INTEGER, 
    allowNull: false,
    comment: '序列號(不含前綴)'
  },
  status: { 
    type: DataTypes.STRING(20), 
    defaultValue: 'waiting',
    comment: '狀態(waiting/called/processing/completed/cancelled)'
  },
  called_at: { 
    type: DataTypes.DATE,
    comment: '叫號時間'
  },
  completed_at: { 
    type: DataTypes.DATE,
    comment: '完成時間'
  }
}, {
  comment: '票號表',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false
});

// 票号序列表(ticket_sequences)
const TicketSequence = sequelize.define('ticket_sequence', {
  current_number: { 
    type: DataTypes.INTEGER, 
    defaultValue: 0,
    comment: '當前序列號'
  },
  date: { 
    type: DataTypes.DATEONLY, 
    allowNull: false,
    comment: '日期(每天重置)'
  }
}, {
  comment: '票號序列表',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      unique: true,
      fields: ['business_type_id', 'date']
    }
  ]
});

// 叫号记录表(call_logs)
const CallLog = sequelize.define('call_log', {
  call_type: { 
    type: DataTypes.STRING(20), 
    allowNull: false,
    comment: '叫號類型(next/manual)'
  }
}, {
  comment: '叫號記錄表',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false
});

// 系统设置表(settings)
const Setting = sequelize.define('setting', {
  key: { 
    type: DataTypes.STRING(50), 
    allowNull: false,
    unique: true,
    comment: '設置鍵'
  },
  value: { 
    type: DataTypes.TEXT, 
    allowNull: false,
    comment: '設置值'
  },
  description: { 
    type: DataTypes.TEXT,
    comment: '描述'
  }
}, {
  comment: '系統設置表',
  timestamps: true,
  createdAt: false,
  updatedAt: 'updated_at'
});

// 设备表(devices)
const Device = sequelize.define('device', {
  device_type: { 
    type: DataTypes.STRING(20), 
    allowNull: false,
    comment: '設備類型(ticket/display/counter)'
  },
  device_name: { 
    type: DataTypes.STRING(50), 
    allowNull: false,
    comment: '設備名稱'
  },
  device_id: { 
    type: DataTypes.STRING(100), 
    allowNull: false,
    unique: true,
    comment: '設備唯一標識'
  },
  status: { 
    type: DataTypes.STRING(20), 
    defaultValue: 'active',
    comment: '設備狀態(active/inactive)'
  }
}, {
  comment: '設備表',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false
});

// 定义关联关系
BusinessType.hasMany(Ticket);
Ticket.belongsTo(BusinessType);

BusinessType.hasMany(TicketSequence);
TicketSequence.belongsTo(BusinessType);

Counter.belongsTo(Ticket, { as: 'currentTicket', foreignKey: 'current_ticket_id' });
Counter.belongsTo(BusinessType, { as: 'currentBusinessType', foreignKey: 'current_business_type_id' });

Ticket.belongsTo(Counter);

CallLog.belongsTo(Ticket);
CallLog.belongsTo(Counter);
CallLog.belongsTo(BusinessType);

Device.belongsTo(Counter);

module.exports = {
  sequelize,
  BusinessType,
  Counter,
  Ticket,
  TicketSequence,
  CallLog,
  Setting,
  Device
};
