const cron = require('node-cron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { Op } = require('sequelize');
const sequelize = require('./db/connection');
const SchedulerLock = require('./db/models/SchedulerLock');

const CONFIG = {
  schedule: '*/30 * * * * *',
  scripts: {
    parser: 'src/index.js',
    processor: 'src/processData.js',
  },
  logDir: path.join(__dirname, 'logs'),
  lockFile: path.join(__dirname, '.scheduler.lock'),
  staleLockTimeoutMs: 3600000,
};

let lockTableReady = false;

if (!fs.existsSync(CONFIG.logDir)) {
  fs.mkdirSync(CONFIG.logDir, { recursive: true });
}

function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${type.toUpperCase()}] ${message}`;
  console.log(logMessage);

  const logFile = path.join(CONFIG.logDir, `scheduler-${new Date().toISOString().split('T')[0]}.log`);
  fs.appendFileSync(logFile, logMessage + '\n', 'utf8');
}

async function ensureLockTable() {
  if (!lockTableReady) {
    await sequelize.authenticate();
    await SchedulerLock.sync();
    lockTableReady = true;
  }
}

async function acquireLock() {
  await ensureLockTable();
  const now = new Date();
  const lockName = 'data_collection_lock';
  const processId = `${process.pid}_${Date.now()}`;
  const staleThreshold = new Date(Date.now() - CONFIG.staleLockTimeoutMs);

  try {
    const [lock, created] = await SchedulerLock.findOrCreate({
      where: { lockName },
      defaults: { lockName, lockedAt: now, processId },
    });

    if (created) {
      log(`Блокировка получена. Process ID: ${processId}`, 'info');
      return { processId };
    }

    if (lock.lockedAt < staleThreshold) {
      lock.lockedAt = now;
      lock.processId = processId;
      await lock.save();
      log(`Блокировка обновлена после таймаута. Process ID: ${processId}`, 'info');
      return { processId };
    }

    log('Блокировка уже занята другим процессом', 'warn');
    return null;
  } catch (error) {
    log(`Ошибка при получении блокировки: ${error.message}`, 'error');
    return null;
  }
}

async function releaseLock(lock) {
  if (!lock) return;

  try {
    await SchedulerLock.destroy({
      where: { lockName: 'data_collection_lock', processId: lock.processId },
    });
    log(`Блокировка освобождена. Process ID: ${lock.processId}`, 'info');
  } catch (error) {
    log(`Ошибка при освобождении блокировки: ${error.message}`, 'error');
  }
}

async function cleanupOldLocks() {
  try {
    await ensureLockTable();
    const removed = await SchedulerLock.destroy({
      where: {
        lockedAt: {
          [Op.lt]: new Date(Date.now() - CONFIG.staleLockTimeoutMs),
        },
      },
    });

    if (removed > 0) {
      log(`Очищено ${removed} старых блокировок`, 'info');
    }
  } catch (error) {
    log(`Ошибка при очистке старых блокировок: ${error.message}`, 'error');
  }
}

function runScript(scriptPath, scriptName) {
  return new Promise((resolve, reject) => {
    log(`Запуск скрипта: ${scriptName}`, 'info');

    const startTime = Date.now();
    const child = spawn('node', [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
      log(`[${scriptName} stdout]: ${data.toString().trim()}`, 'debug');
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
      log(`[${scriptName} stderr]: ${data.toString().trim()}`, 'error');
    });

    child.on('close', (code) => {
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      if (code === 0) {
        log(`Скрипт ${scriptName} завершен успешно за ${duration} сек`, 'info');
        resolve({ success: true, stdout, stderr, duration });
      } else {
        log(`Скрипт ${scriptName} завершен с ошибкой (код: ${code}) за ${duration} сек`, 'error');
        reject(new Error(`Скрипт завершился с кодом ${code}: ${stderr}`));
      }
    });

    child.on('error', (error) => {
      log(`Ошибка запуска скрипта ${scriptName}: ${error.message}`, 'error');
      reject(error);
    });

    setTimeout(() => {
      if (child.exitCode === null) {
        log(`Скрипт ${scriptName} превысил лимит времени и будет завершен`, 'error');
        child.kill('SIGTERM');
        reject(new Error('Превышен лимит времени выполнения'));
      }
    }, 7200000);
  });
}

async function collectData() {
  log('Начало выполнения задачи сбора данных', 'info');

  const lock = await acquireLock();
  if (!lock) {
    log('Не удалось получить блокировку. Задача уже выполняется.', 'warn');
    return;
  }

  try {
    log('=== ШАГ 1: ПАРСИНГ ДАННЫХ ===', 'info');
    await runScript(CONFIG.scripts.parser, 'Parser');

    log('Пауза 30 секунд перед обработкой данных...', 'info');
    await new Promise(resolve => setTimeout(resolve, 30000));

    log('=== ШАГ 2: ОБРАБОТКА И ЗАГРУЗКА В БД ===', 'info');
    await runScript(CONFIG.scripts.processor, 'Processor');

    log('Задача сбора данных успешно завершена', 'info');
  } catch (error) {
    log(`Ошибка при выполнении задачи: ${error.message}`, 'error');

    const errorLog = {
      timestamp: new Date().toISOString(),
      error: error.message,
      stack: error.stack,
    };

    const errorFile = path.join(CONFIG.logDir, 'critical-errors.json');
    const errors = fs.existsSync(errorFile)
      ? JSON.parse(fs.readFileSync(errorFile, 'utf8'))
      : [];

    errors.push(errorLog);
    fs.writeFileSync(errorFile, JSON.stringify(errors, null, 2), 'utf8');
  } finally {
    await releaseLock(lock);
  }
}

function setupSignalHandlers() {
  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];

  signals.forEach(signal => {
    process.on(signal, async () => {
      log(`Получен сигнал ${signal}. Завершение работы...`, 'info');
      try {
        await sequelize.close();
      } catch (error) {
        log(`Ошибка при закрытии соединения: ${error.message}`, 'error');
      }
      process.exit(0);
    });
  });
}

async function recoverFromCrash() {
  log('Проверка восстановления после возможного сбоя...', 'info');

  try {
    await cleanupOldLocks();

    if (fs.existsSync(CONFIG.lockFile)) {
      const lockTime = fs.statSync(CONFIG.lockFile).mtime;
      const lockAge = Date.now() - lockTime.getTime();

      if (lockAge > CONFIG.staleLockTimeoutMs) {
        fs.unlinkSync(CONFIG.lockFile);
        log('Удален старый файл блокировки', 'info');
      }
    }
  } catch (error) {
    log(`Ошибка при восстановлении: ${error.message}`, 'error');
  }
}

async function main() {
  log('Запуск планировщика задач', 'info');
  log(`Расписание: ${CONFIG.schedule}`, 'info');

  setupSignalHandlers();
  await recoverFromCrash();

  log('Запуск начального сбора данных...', 'info');
  await collectData();

  cron.schedule(CONFIG.schedule, async () => {
    log('CRON: Запуск по расписанию', 'info');
    await collectData();
  });

  cron.schedule('0 * * * *', async () => {
    await cleanupOldLocks();
  });

  log('Планировщик успешно запущен и работает', 'info');

  if (process.send) {
    process.send('ready');
  }
}

main().catch(error => {
  log(`Критическая ошибка при запуске планировщика: ${error.message}`, 'error');
  log(`Stack trace: ${error.stack}`, 'error');
  process.exit(1);
});
