const { DataTypes, Sequelize } = require('sequelize');
const sequelize = require('../connection');

const Movie = sequelize.define('Movie', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  rank: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  title: {
    type: DataTypes.STRING(500),
    allowNull: false,
    defaultValue: 'Unknown',
  },
  year: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  weekendGross: {
    type: DataTypes.BIGINT,
    allowNull: true,
    field: 'weekend_gross',
  },
  totalGross: {
    type: DataTypes.BIGINT,
    allowNull: true,
    field: 'total_gross',
  },
  domesticGross: {
    type: DataTypes.BIGINT,
    allowNull: true,
    field: 'domestic_gross',
  },
  internationalGross: {
    type: DataTypes.BIGINT,
    allowNull: true,
    field: 'international_gross',
  },
  rating: {
    type: DataTypes.DECIMAL(4, 1),
    allowNull: true,
  },
  releaseDate: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'release_date',
  },
  source: {
    type: DataTypes.STRING(100),
    allowNull: false,
    defaultValue: 'Unknown',
  },
  url: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  scrapedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'scraped_at',
    defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
  },
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'created_at',
    defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
  },
}, {
  tableName: 'movies',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  indexes: [
    { fields: ['title'] },
    { fields: ['source'] },
    { fields: ['scraped_at'] },
    { fields: ['rank'] },
    { fields: ['total_gross'], using: 'BTREE' },
    { fields: ['year'] },
    {
      name: 'unique_movie_source_scraped',
      unique: true,
      fields: ['title', 'source', 'scraped_at'],
    },
  ],
});

module.exports = Movie;