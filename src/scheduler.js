const cron = require('node-cron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');


const CONFIG = {
  // Cрабатывание каждые 30сек
  schedule: '*/30 * * * * *',
  
  scripts: {
    parser: 'src/index.js',
    processor: 'src/processData.js'
  },
  
  
  dbConfig: {
    user: 'admin',
    host: 'localhost',
    database: 'Box office',
    password: '12345',
    port: 5432,
  },
  
  
  logDir: path.join(__dirname, 'logs'),
  lockFile: path.join(__dirname, '.scheduler.lock')
};


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

//Блокирование через БД
async function acquireLock() {
  const client = new Client(CONFIG.dbConfig);
  
  try {
    await client.connect();
    
    // ТАБЛИЦА для блоков
    await client.query(`
      CREATE TABLE IF NOT EXISTS scheduler_locks (
        lock_name VARCHAR(100) PRIMARY KEY,
        locked_at TIMESTAMP NOT NULL,
        process_id VARCHAR(100)
      )
    `);
    
    // Получение блокировки
    const lockName = 'data_collection_lock';
    const processId = `${process.pid}_${Date.now()}`;
    const now = new Date().toISOString();
    
    const result = await client.query(`
      INSERT INTO scheduler_locks (lock_name, locked_at, process_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (lock_name) 
      DO UPDATE SET 
        locked_at = CASE 
          WHEN scheduler_locks.locked_at < $4 
          THEN $2 
          ELSE scheduler_locks.locked_at 
        END,
        process_id = CASE 
          WHEN scheduler_locks.locked_at < $4 
          THEN $3 
          ELSE scheduler_locks.process_id 
        END
      WHERE scheduler_locks.locked_at < $4
      RETURNING lock_name
    `, [lockName, now, processId, new Date(Date.now() - 3600000).toISOString()]); // 1 час timeout
    
    const acquired = result.rows.length > 0;
    
    if (acquired) {
      log(`Блокировка получена. Process ID: ${processId}`, 'info');
      return { client, processId };
    } else {
      log('Блокировка уже занята другим процессом', 'warn');
      await client.end();
      return null;
    }
    
  } catch (error) {
    log(`Ошибка при получении блокировки: ${error.message}`, 'error');
    if (client) await client.end();
    return null;
  }
}

// Функиця для освобождения очереди
async function releaseLock(lock) {
  if (!lock) return;
  
  try {
    const { client, processId } = lock;
    
    // Удаляем только нашу блокировку
    await client.query(`
      DELETE FROM scheduler_locks 
      WHERE lock_name = 'data_collection_lock' 
      AND process_id = $1
    `, [processId]);
    
    log(`Блокировка освобождена. Process ID: ${processId}`, 'info');
    
  } catch (error) {
    log(`Ошибка при освобождении блокировки: ${error.message}`, 'error');
  } finally {
    if (lock.client) await lock.client.end();
  }
}

// Очистка блокировок
async function cleanupOldLocks() {
  const client = new Client(CONFIG.dbConfig);
  
  try {
    await client.connect();
    
    // Удаляем блокировки старше 1 часа
    const result = await client.query(`
      DELETE FROM scheduler_locks 
      WHERE locked_at < $1
      RETURNING lock_name, process_id, locked_at
    `, [new Date(Date.now() - 3600000).toISOString()]);
    
    if (result.rows.length > 0) {
      log(`Очищено ${result.rows.length} старых блокировок`, 'info');
    }
    
  } catch (error) {
    log(`Ошибка при очистке старых блокировок: ${error.message}`, 'error');
  } finally {
    if (client) await client.end();
  }
}


function runScript(scriptPath, scriptName) {
  return new Promise((resolve, reject) => {
    log(`Запуск скрипта: ${scriptName}`, 'info');
    
    const startTime = Date.now();
    const child = spawn('node', [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe']
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
  
  // Получаем блокировку
  const lock = await acquireLock();
  if (!lock) {
    log('Не удалось получить блокировку. Задача уже выполняется.', 'warn');
    return;
  }
  
  try {
    
    log('=== ШАГ 1: ПАРСИНГ ДАННЫХ ===', 'info');
    await runScript(CONFIG.scripts.parser, 'Parser');
    
    // Пауза между запусками (30 секунд)
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
      stack: error.stack
    };
    
    const errorFile = path.join(CONFIG.logDir, 'critical-errors.json');
    const errors = fs.existsSync(errorFile) 
      ? JSON.parse(fs.readFileSync(errorFile, 'utf8'))
      : [];
    
    errors.push(errorLog);
    fs.writeFileSync(errorFile, JSON.stringify(errors, null, 2), 'utf8');
    
  } finally {
    
    await releaseLock(lock);//освобождение очереди
  }
}


function setupSignalHandlers() {
  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
  
  signals.forEach(signal => {
    process.on(signal, async () => {
      log(`Получен сигнал ${signal}. Завершение работы...`, 'info');
      
      
      
      process.exit(0);
    });
  });
}


async function recoverFromCrash() {
  log('Проверка восстановления после возможного сбоя...', 'info');
  
  try {
   
    await cleanupOldLocks();
    
    // Проверяем файловую блокировку
    if (fs.existsSync(CONFIG.lockFile)) {
      const lockTime = fs.statSync(CONFIG.lockFile).mtime;
      const lockAge = Date.now() - lockTime.getTime();
      
      // Если файл блокировки старше 1 часа, удаляем его
      if (lockAge > 3600000) {
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