const fs = require('fs');
const path = require('path');
const YAMLLoader = require('./yamlLoader');

async function saveData(data, filename) {
  try {
    const dataDir = './data';

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const yamlPath = path.join(dataDir, `${filename}.yaml`);
    YAMLLoader.saveData(data, yamlPath);

    return true;
  } catch (error) {
    console.error('Ошибка сохранения данных:', error.message);
    return false;
  }
}

module.exports = { saveData };