const sequelize = require('./connection');
const Movie = require('./models/Movie');
const SchedulerLock = require('./models/SchedulerLock');

async function migrate() {
  try {
    await sequelize.authenticate();
    await SchedulerLock.sync();
    await Movie.sync();
    console.log('Миграции выполнены успешно.');
  } catch (error) {
    console.error('Ошибка при выполнении миграций:', error);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

migrate();