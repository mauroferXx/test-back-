/**
 * Servicio de Estimación de Precios
 * 
 * Este servicio maneja la estimación de precios cuando no hay APIs de precios disponibles.
 * Separado de openFoodFactsService.js que solo maneja información nutricional.
 */

/**
 * Mapeo de países a monedas y tasas de conversión aproximadas
 */
export const countryCurrencyMap = {
  'en:spain': { currency: 'EUR', symbol: '€', rate: 1.0 },
  'en:france': { currency: 'EUR', symbol: '€', rate: 1.0 },
  'en:italy': { currency: 'EUR', symbol: '€', rate: 1.0 },
  'en:germany': { currency: 'EUR', symbol: '€', rate: 1.0 },
  'en:portugal': { currency: 'EUR', symbol: '€', rate: 1.0 },
  'en:netherlands': { currency: 'EUR', symbol: '€', rate: 1.0 },
  'en:belgium': { currency: 'EUR', symbol: '€', rate: 1.0 },
  'en:switzerland': { currency: 'CHF', symbol: 'CHF', rate: 0.95 },
  'en:united-kingdom': { currency: 'GBP', symbol: '£', rate: 0.85 },
  'en:united-states': { currency: 'USD', symbol: '$', rate: 1.10 },
  'en:mexico': { currency: 'MXN', symbol: '$', rate: 20.0 },
  'en:argentina': { currency: 'ARS', symbol: '$', rate: 950.0 },
  'en:colombia': { currency: 'COP', symbol: '$', rate: 4500.0 },
  'en:chile': { currency: 'CLP', symbol: '$', rate: 950.0 }
};

/**
 * Estima un precio basado en la categoría del producto y el país
 * 
 * IMPORTANTE: Este precio es determinístico (mismo producto = mismo precio)
 * Usa un hash del barcode para generar un precio consistente
 */
/**
 * Estima un precio basado en la categoría del producto
 * IMPORTANTE: Siempre devuelve precio en EUR (moneda base)
 * La conversión a otras monedas se hace en el frontend o en getProductPrice
 */
export const countryPriceMultipliers = {
  'en:chile': 0.6,        // Precios más bajos en Chile
  'en:argentina': 0.5,    // Precios más bajos
  'en:colombia': 0.5,     // Precios más bajos
  'en:mexico': 0.7,       // Precios moderados
  'en:spain': 1.0,        // Base (Europa)
  'en:france': 1.0,
  'en:italy': 1.0,
  'en:germany': 1.1,      // Precios ligeramente más altos
  'en:united-kingdom': 1.2, // Precios más altos
  'en:united-states': 1.0,
  'en:switzerland': 1.3   // Precios más altos
};

export function estimatePriceFromCategory(product, country = null) {
  // Si country es null, siempre devolver EUR (precio base)
  // La conversión se hace después en getProductPrice
  
  const category = (product.categories || product.categories_tags?.[0] || '').toLowerCase();
  
  // Precios estimados por categoría (en euros base)
  // Estos son precios base en EUR, independiente del país
  const basePriceRanges = {
    'beverages': { min: 1.5, max: 3.5 },
    'dairy': { min: 2.0, max: 5.0 },
    'snacks': { min: 1.0, max: 4.0 },
    'fruits': { min: 2.5, max: 6.0 },
    'vegetables': { min: 1.5, max: 4.0 },
    'meat': { min: 5.0, max: 15.0 },
    'fish': { min: 8.0, max: 20.0 },
    'bread': { min: 1.0, max: 3.0 },
    'cereals': { min: 2.0, max: 5.0 },
    'default': { min: 2.0, max: 5.0 }
  };

  let range = basePriceRanges.default;
  for (const [key, value] of Object.entries(basePriceRanges)) {
    if (category.includes(key)) {
      range = value;
      break;
    }
  }

  // Generar precio determinístico basado en el barcode del producto
  // Esto asegura que el mismo producto siempre tenga el mismo precio base
  let priceEUR;
  if (product.barcode) {
    // Usar un hash simple del barcode para generar un número determinístico entre 0 y 1
    let hash = 0;
    for (let i = 0; i < product.barcode.length; i++) {
      const char = product.barcode.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convertir a entero de 32 bits
    }
    // Convertir hash a un número entre 0 y 1
    // Usar Math.abs y módulo para asegurar que esté entre 0 y 1
    const normalizedHash = (Math.abs(hash) % 1000000) / 1000000; // Número entre 0 y 1
    // Generar precio dentro del rango usando el hash
    priceEUR = normalizedHash * (range.max - range.min) + range.min;
  } else {
    // Si no hay barcode, usar un hash del nombre
    let hash = 0;
    const name = product.name || 'unknown';
    for (let i = 0; i < name.length; i++) {
      const char = name.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    // Usar módulo para asegurar que esté entre 0 y 1
    const normalizedHash = (Math.abs(hash) % 1000000) / 1000000; // Número entre 0 y 1
    priceEUR = normalizedHash * (range.max - range.min) + range.min;
  }
  
  // IMPORTANTE: Para guardar en BD, siempre devolver precio base en EUR
  // No aplicar multiplicadores de país ni conversión aquí
  // La conversión se hace en getProductPrice cuando se consulta
  
  // Si country es null, devolver precio base en EUR (para guardar en BD)
  if (country === null) {
    return {
      amount: parseFloat(priceEUR.toFixed(2)),
      currency: 'EUR',
      symbol: '€'
    };
  }
  
  // Si se especifica país, aplicar multiplicador pero seguir devolviendo EUR
  // (esto es para compatibilidad, pero idealmente siempre se llama con null para guardar)
  const multiplier = country && countryPriceMultipliers[country] 
    ? countryPriceMultipliers[country] 
    : 1.0;
  const adjustedPriceEUR = priceEUR * multiplier;
  
  // SIEMPRE devolver en EUR para guardar en BD
  // La conversión a otras monedas se hace en getProductPrice
  return {
    amount: parseFloat(adjustedPriceEUR.toFixed(2)),
    currency: 'EUR',
    symbol: '€'
  };
}

