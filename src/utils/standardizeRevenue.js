// utils/standardizeRevenue.js

/**
 * Стандартизирует значение сборов (удаляет символы $, пробелы и переводит сокращения)
 * @param {string|number} revenue - Исходное значение сборов (например, "$22M", "22,000,000", "22.5M", 22000000)
 * @returns {number|null} - Стандартизированное числовое значение сборов или null
 */
function standardizeRevenue(revenue) {
  // Проверяем на null/undefined/пустые значения
  if (revenue === null || revenue === undefined || revenue === '' || 
      revenue === 'N/A' || revenue === 'n/a' || revenue === 'NaN') {
    return null;
  }

  // Если это уже число - просто возвращаем его, округлив до целого
  if (typeof revenue === 'number') {
    if (isNaN(revenue) || !isFinite(revenue)) {
      return null;
    }
    return Math.round(revenue);
  }

  // Если это строка
  if (typeof revenue === 'string') {
    let cleanRevenue = revenue.trim();
    
    // Удаляем все пробелы
    cleanRevenue = cleanRevenue.replace(/\s+/g, '');
    
    // Если строка пустая после очистки
    if (cleanRevenue === '') {
      return null;
    }

    // Проверяем, не является ли строка уже числом
    if (/^-?\d+$/.test(cleanRevenue)) {
      // Целое число
      return parseInt(cleanRevenue, 10);
    }

    if (/^-?\d+\.\d+$/.test(cleanRevenue)) {
      // Число с плавающей точкой
      return Math.round(parseFloat(cleanRevenue));
    }

    // Проверяем наличие символов валюты и удаляем их
    if (cleanRevenue.includes('$') || cleanRevenue.includes('€') || 
        cleanRevenue.includes('£') || cleanRevenue.includes('¥')) {
      // Удаляем все символы валют
      cleanRevenue = cleanRevenue.replace(/[$€£¥]/g, '');
    }

    // Обрабатываем запятые как разделители тысяч
    cleanRevenue = cleanRevenue.replace(/,/g, '');

    // Приводим к нижнему регистру для удобства проверки
    const lowerRevenue = cleanRevenue.toLowerCase();

    // Ищем множители (billion, million, k)
    let multiplier = 1;
    let numericPart = cleanRevenue;

    if (lowerRevenue.includes('billion') || lowerRevenue.includes('b')) {
      multiplier = 1000000000;
      // Удаляем текст множителя
      numericPart = numericPart.replace(/billion|b/gi, '');
    } else if (lowerRevenue.includes('million') || lowerRevenue.includes('m')) {
      multiplier = 1000000;
      numericPart = numericPart.replace(/million|m/gi, '');
    } else if (lowerRevenue.includes('k') || lowerRevenue.includes('тыс')) {
      multiplier = 1000;
      numericPart = numericPart.replace(/k|тыс/gi, '');
    }

    // Извлекаем число из оставшейся части
    // Ищем паттерн числа (может быть с точкой)
    const numberMatch = numericPart.match(/[-+]?\d*\.?\d+/);
    if (numberMatch) {
      const amount = parseFloat(numberMatch[0]);
      if (!isNaN(amount)) {
        // Умножаем и округляем до целого
        // Используем целочисленное умножение для избежания ошибок округления
        const roundedAmount = Math.round(amount);
        const result = Math.round(roundedAmount * multiplier);
        return result;
      }
    }

    // Если ничего не нашли, пытаемся просто распарсить как число
    const finalAmount = parseFloat(cleanRevenue);
    if (!isNaN(finalAmount)) {
      return Math.round(finalAmount);
    }
  }

  // Если ничего не сработало, возвращаем null
  return null;
}

module.exports = { standardizeRevenue };