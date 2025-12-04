
function standardizeRevenue(revenue) {
  
  if (revenue === null || revenue === undefined || revenue === '' || 
      revenue === 'N/A' || revenue === 'n/a' || revenue === 'NaN') {
    return null;
  }

  
  if (typeof revenue === 'number') {
    if (isNaN(revenue) || !isFinite(revenue)) {
      return null;
    }
    return Math.round(revenue);
  }

  
  if (typeof revenue === 'string') {
    let cleanRevenue = revenue.trim();
    
    
    cleanRevenue = cleanRevenue.replace(/\s+/g, '');
    
    
    if (cleanRevenue === '') {
      return null;
    }

    
    if (/^-?\d+$/.test(cleanRevenue)) {
     
      return parseInt(cleanRevenue, 10);
    }

    if (/^-?\d+\.\d+$/.test(cleanRevenue)) {
      
      return Math.round(parseFloat(cleanRevenue));
    }

    
    if (cleanRevenue.includes('$') || cleanRevenue.includes('€') || 
        cleanRevenue.includes('£') || cleanRevenue.includes('¥')) {
      
      cleanRevenue = cleanRevenue.replace(/[$€£¥]/g, '');
    }

    
    cleanRevenue = cleanRevenue.replace(/,/g, '');

   
    const lowerRevenue = cleanRevenue.toLowerCase();

   
    let multiplier = 1;
    let numericPart = cleanRevenue;

    if (lowerRevenue.includes('billion') || lowerRevenue.includes('b')) {
      multiplier = 1000000000;
      
      numericPart = numericPart.replace(/billion|b/gi, '');
    } else if (lowerRevenue.includes('million') || lowerRevenue.includes('m')) {
      multiplier = 1000000;
      numericPart = numericPart.replace(/million|m/gi, '');
    } else if (lowerRevenue.includes('k') || lowerRevenue.includes('тыс')) {
      multiplier = 1000;
      numericPart = numericPart.replace(/k|тыс/gi, '');
    }

    
    const numberMatch = numericPart.match(/[-+]?\d*\.?\d+/);
    if (numberMatch) {
      const amount = parseFloat(numberMatch[0]);
      if (!isNaN(amount)) {
       
        const roundedAmount = Math.round(amount);
        const result = Math.round(roundedAmount * multiplier);
        return result;
      }
    }

    
    const finalAmount = parseFloat(cleanRevenue);
    if (!isNaN(finalAmount)) {
      return Math.round(finalAmount);
    }
  }

 
  return null;
}

module.exports = { standardizeRevenue };