const { Sequelize } = require('sequelize');

const DB_NAME = process.env.DB_NAME || process.env.POSTGRES_DB || 'testdb';
const DB_USER = process.env.DB_USER || process.env.POSTGRES_USER || 'admin';
const DB_PASSWORD = process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD || '12345';
const DB_HOST = process.env.DB_HOST || process.env.POSTGRES_HOST || 'localhost';
const DB_PORT = Number(process.env.DB_PORT || process.env.POSTGRES_PORT || 5432);

const sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASSWORD, {
  host: DB_HOST,
  port: DB_PORT,
  dialect: 'postgres',
  logging: false,
});

module.exports = sequelize;
