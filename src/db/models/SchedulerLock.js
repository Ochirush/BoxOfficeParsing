const { DataTypes } = require('sequelize');
const sequelize = require('../connection');

const SchedulerLock = sequelize.define('SchedulerLock', {
  lockName: {
    type: DataTypes.STRING(100),
    primaryKey: true,
    field: 'lock_name',
  },
  lockedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'locked_at',
  },
  processId: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'process_id',
  },
}, {
  tableName: 'scheduler_locks',
  timestamps: false,
});

module.exports = SchedulerLock;