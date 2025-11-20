import { countryCurrencyMap, countryPriceMultipliers, estimatePriceFromCategory } from '../services/priceEstimationService.js';

const MIN_REASONABLE_PRICE_EUR = 0.5;

function getCurrencyInfo(country, currencyCode) {
  if (country && countryCurrencyMap[country]) {
    return { ...countryCurrencyMap[country], country };
  }

  if (currencyCode) {
    const upper = currencyCode.toUpperCase();
    const entry = Object.entries(countryCurrencyMap).find(
      ([, info]) => info.currency?.toUpperCase() === upper
    );
    if (entry) {
      const [countryKey, info] = entry;
      return { ...info, country: countryKey };
    }
  }

  return null;
}

function extractCountry(product) {
  if (product.country) {
    return product.country;
  }

  const maybeData = product.openfoodfacts_data;

  if (maybeData) {
    if (typeof maybeData === 'object' && Array.isArray(maybeData.countries_tags) && maybeData.countries_tags.length > 0) {
      return maybeData.countries_tags[0];
    }

    if (typeof maybeData === 'string') {
      try {
        const parsed = JSON.parse(maybeData);
        if (Array.isArray(parsed.countries_tags) && parsed.countries_tags.length > 0) {
          return parsed.countries_tags[0];
        }
      } catch (error) {
        // Ignorar errores de parseo
      }
    }
  }

  return null;
}

/**
 * Normaliza el precio recibido (posiblemente en moneda local) para guardarlo en EUR en la BD
 */
function buildEstimationPayload(product) {
  const payload = {
    barcode: product.barcode,
    name: product.name,
    categories: product.category || product.categories || '',
    categories_tags: product.categories_tags || (product.category ? [product.category] : [])
  };

  const openfoodfactsData = product.openfoodfacts_data;
  let parsedData = openfoodfactsData;

  if (typeof openfoodfactsData === 'string') {
    try {
      parsedData = JSON.parse(openfoodfactsData);
    } catch (error) {
      parsedData = null;
    }
  }

  if (parsedData && typeof parsedData === 'object') {
    if (parsedData.categories) {
      payload.categories = parsedData.categories;
    }
    if (Array.isArray(parsedData.categories_tags) && parsedData.categories_tags.length > 0) {
      payload.categories_tags = parsedData.categories_tags;
    }
  }

  return payload;
}

export function normalizePriceToEUR(productData = {}) {
  if (!productData || !productData.price) {
    return productData;
  }

  const normalized = { ...productData };
  const numericPrice = parseFloat(normalized.price);

  if (!numericPrice || Number.isNaN(numericPrice) || numericPrice <= 0) {
    return normalized;
  }

  const detectedCountry = extractCountry(normalized);
  const currencyInfo = getCurrencyInfo(detectedCountry, normalized.currency);
  const multiplier = detectedCountry && countryPriceMultipliers[detectedCountry]
    ? countryPriceMultipliers[detectedCountry]
    : 1;

  // Si tenemos info de moneda distinta a EUR, convertir a EUR
  if (currencyInfo && currencyInfo.currency !== 'EUR' && currencyInfo.rate) {
    const basePriceEUR = numericPrice / currencyInfo.rate / multiplier;
    normalized.price = parseFloat(basePriceEUR.toFixed(2));
    normalized.currency = 'EUR';
    normalized.currency_symbol = '€';
    normalized.country = detectedCountry || currencyInfo.country || null;
    return normalized;
  }

  // Si ya está en EUR pero pasó por multiplicador, eliminar multiplicador para guardar precio base
  if (currencyInfo && currencyInfo.currency === 'EUR' && multiplier !== 1) {
    normalized.price = parseFloat((numericPrice / multiplier).toFixed(2));
    normalized.country = detectedCountry || currencyInfo.country || null;
    return normalized;
  }

  // Si no se pudo determinar moneda pero el precio es sospechosamente alto, intentar heurística
  if (!currencyInfo && detectedCountry && multiplier !== 1 && numericPrice > 200) {
    // Asumir moneda local y tasa conocida para ese país
    const fallbackCurrencyInfo = countryCurrencyMap[detectedCountry];
    if (fallbackCurrencyInfo?.rate) {
      const basePriceEUR = numericPrice / fallbackCurrencyInfo.rate / multiplier;
      normalized.price = parseFloat(basePriceEUR.toFixed(2));
      normalized.currency = 'EUR';
      normalized.currency_symbol = '€';
      normalized.country = detectedCountry;
      return normalized;
    }
  }

  normalized.country = detectedCountry || normalized.country || null;

  // Si el precio resultante sigue siendo irrealmente bajo (ej. 0.01 EUR),
  // recalcular usando estimatePriceFromCategory para obtener un valor determinístico aceptable
  if (normalized.price && normalized.price < MIN_REASONABLE_PRICE_EUR) {
    try {
      const estimationPayload = buildEstimationPayload(normalized);
      const estimated = estimatePriceFromCategory(estimationPayload, null);
      if (estimated?.amount) {
        normalized.price = parseFloat(estimated.amount.toFixed(2));
        normalized.currency = 'EUR';
        normalized.currency_symbol = '€';
      }
    } catch (error) {
      // Como fallback, asegurar un precio mínimo razonable
      normalized.price = MIN_REASONABLE_PRICE_EUR;
    }
  }

  return normalized;
}

