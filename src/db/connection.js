const { Sequelize } = require('sequelize');

const sequelize = new Sequelize('Box office', 'admin', '12345', {
  host: 'localhost',
  dialect: 'postgres',
  logging: false,
});

module.exports = sequelize;