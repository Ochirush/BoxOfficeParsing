const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');

class YAMLLoader {
  static loadConfig(filePath) {
    try {
      const absolutePath = path.resolve(filePath);
      
      
      if (!fs.existsSync(absolutePath)) {
        throw new Error(`Файл не существует: ${absolutePath}`);
      }
      
      const fileContents = fs.readFileSync(absolutePath, 'utf8');
      const config = yaml.load(fileContents);
      
      return config;
    } catch (error) {
      console.error('Ошибка загрузки YAML:', error.message);
      return null;
    }
  }

  static saveData(data, filePath) {
    try {
      const absolutePath = path.resolve(filePath);
      const yamlData = yaml.dump(data, { 
        indent: 2,
        lineWidth: -1
      });
      
      const dir = path.dirname(absolutePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(absolutePath, yamlData, 'utf8');
      console.log(`Данные сохранены в YAML: ${filePath}`);
      return true;
    } catch (error) {
      console.error('Ошибка сохранения YAML:', error.message);
      return false;
    }
  }
}


module.exports = YAMLLoader;