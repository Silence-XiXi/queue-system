var DataTypes = require("sequelize").DataTypes;
var _businessTypes = require("./businessTypes");
var _counterBusinessLastTicket = require("./counterBusinessLastTicket");
var _counters = require("./counters");
var _settings = require("./settings");

function initModels(sequelize) {
  var businessTypes = _businessTypes(sequelize, DataTypes);
  var counterBusinessLastTicket = _counterBusinessLastTicket(sequelize, DataTypes);
  var counters = _counters(sequelize, DataTypes);
  var settings = _settings(sequelize, DataTypes);

  counterBusinessLastTicket.belongsTo(businessTypes, { as: "business_type", foreignKey: "business_type_id"});
  businessTypes.hasMany(counterBusinessLastTicket, { as: "counter_business_last_tickets", foreignKey: "business_type_id"});
  counterBusinessLastTicket.belongsTo(counters, { as: "counter", foreignKey: "counter_id"});
  counters.hasMany(counterBusinessLastTicket, { as: "counter_business_last_tickets", foreignKey: "counter_id"});

  return {
    businessTypes,
    counterBusinessLastTicket,
    counters,
    settings
  };
}
module.exports = initModels;
module.exports.initModels = initModels;
module.exports.default = initModels;
