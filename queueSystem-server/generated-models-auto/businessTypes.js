const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('businessTypes', {
    id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: true,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    english_name: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    code: {
      type: DataTypes.STRING(10),
      allowNull: false,
      unique: true
    },
    prefix: {
      type: DataTypes.STRING(5),
      allowNull: false
    },
    status: {
      type: DataTypes.STRING(10),
      allowNull: true,
      defaultValue: "active"
    }
  }, {
    sequelize,
    tableName: 'business_types',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        name: "sqlite_autoindex_business_types_1",
        unique: true,
        fields: [
          { name: "code" },
        ]
      },
    ]
  });
};
