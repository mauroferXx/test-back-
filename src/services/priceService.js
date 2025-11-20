import { getTescoProductByBarcode, searchTescoProducts } from './tescoService.js';
import { estimatePriceFromCategory, countryCurrencyMap, countryPriceMultipliers } from './priceEstimationService.js';
import { normalizePriceToEUR } from '../utils/priceNormalization.js';
import { Product } from '../models/Product.js';

/**
 * Servicio unificado para obtener precios de productos
 * Intenta obtener precios reales de APIs externas, si no, estima
 * 
 * Este es el servicio principal para precios - separado de información nutricional
 */
export async function getProductPrice(product, country = null) {
  const normalizedProduct = normalizePriceToEUR(product);
  let basePriceValue = normalizedProduct.price || product.price;
  const originalPriceValue = product?.price ? parseFloat(product.price) : null;
  let normalizedPriceValue = normalizedProduct?.price ? parseFloat(normalizedProduct.price) : null;

  // Si el precio normalizado sigue siendo muy bajo (< 0.5 EUR), recalcularlo
  // Esto corrige productos que se guardaron con precios incorrectos (ej: 0.01)
  if (normalizedPriceValue && normalizedPriceValue < 0.5) {
    try {
      const { estimatePriceFromCategory } = await import('./priceEstimationService.js');
      const estimated = estimatePriceFromCategory(product, null);
      if (estimated?.amount && estimated.amount >= 0.5) {
        normalizedPriceValue = estimated.amount;
        basePriceValue = estimated.amount;
        
        // Actualizar en BD si el producto tiene ID
        if (product?.id) {
          try {
            await Product.updatePrice(product.id, normalizedPriceValue);
            console.log(`Fixed low price for product ${product.id} (${product.name}): ${originalPriceValue} -> ${normalizedPriceValue} EUR`);
          } catch (updateError) {
            console.warn(`Could not update price for product ${product.id}:`, updateError.message);
          }
        }
      }
    } catch (error) {
      console.warn(`Could not recalculate price for product ${product.id || product.barcode}:`, error.message);
    }
  }

  // Si normalizamos el precio (ej: estaba en moneda local) y cambió significativamente,
  // guardar el nuevo precio base en la BD para evitar inconsistencias futuras
  const priceDiff =
    normalizedPriceValue && originalPriceValue
      ? Math.abs(normalizedPriceValue - originalPriceValue)
      : 0;

  if (
    product?.id &&
    normalizedPriceValue &&
    originalPriceValue &&
    Number.isFinite(originalPriceValue) &&
    Number.isFinite(normalizedPriceValue) &&
    priceDiff > 0.25 && // actualizar si la diferencia es mayor a 0.25 EUR (~250 CLP)
    normalizedPriceValue >= 0.5 // solo actualizar si el nuevo precio es razonable
  ) {
    try {
      await Product.updatePrice(product.id, normalizedPriceValue);
    } catch (updateError) {
      console.warn(`Could not normalize price for product ${product.id}:`, updateError.message);
    }
  }

  // Si el producto ya tiene un precio guardado en la base de datos (precio base en EUR)
  // usarlo como base y convertir según país
  if (basePriceValue && basePriceValue > 0) {
    const basePriceEUR = parseFloat(basePriceValue);
    
    // Aplicar multiplicador de país y convertir
    const multiplier = country && countryPriceMultipliers[country] 
      ? countryPriceMultipliers[country] 
      : 1.0;
    const adjustedPriceEUR = basePriceEUR * multiplier;
    
    if (country && country !== 'all' && countryCurrencyMap[country]) {
      const currencyInfo = countryCurrencyMap[country];
      if (!currencyInfo || !currencyInfo.rate) {
        console.warn(`Invalid currency info for country: ${country}`);
        // Fallback a EUR
        return {
          amount: parseFloat(adjustedPriceEUR.toFixed(2)),
          currency: 'EUR',
          symbol: '€',
          source: 'estimated',
          isReal: false
        };
      }
      const convertedPrice = adjustedPriceEUR * currencyInfo.rate;
      return {
        amount: parseFloat(convertedPrice.toFixed(2)),
        currency: currencyInfo.currency,
        symbol: currencyInfo.symbol,
        source: 'estimated',
        isReal: false
      };
    }
    
    return {
      amount: parseFloat(adjustedPriceEUR.toFixed(2)),
      currency: 'EUR',
      symbol: '€',
      source: 'estimated',
      isReal: false
    };
  }

  // Si el país es Reino Unido, intentar Tesco API primero
  if (country === 'en:united-kingdom' && product.barcode) {
    try {
      const tescoProduct = await getTescoProductByBarcode(product.barcode);
      if (tescoProduct && tescoProduct.price) {
        return {
          amount: parseFloat(tescoProduct.price),
          currency: tescoProduct.currency,
          symbol: tescoProduct.currency_symbol,
          source: 'tesco',
          isReal: true
        };
      }
    } catch (error) {
      console.log('Tesco API not available, using estimation');
    }
  }

  // Si no hay precio guardado ni real, estimar (precio determinístico)
  const estimated = estimatePriceFromCategory(product, country);
  return {
    ...estimated,
    source: 'estimated',
    isReal: false
  };
}

/**
 * Busca productos con precios reales cuando sea posible
 */
export async function searchProductsWithPrices(query, country = null, limit = 20) {
  // Si es Reino Unido, intentar Tesco primero
  if (country === 'en:united-kingdom') {
    try {
      const tescoProducts = await searchTescoProducts(query, limit);
      if (tescoProducts && tescoProducts.length > 0) {
        return {
          products: tescoProducts,
          source: 'tesco',
          hasRealPrices: true
        };
      }
    } catch (error) {
      console.log('Tesco search not available');
    }
  }

  return null; // Retornar null para que se use Open Food Facts
}

