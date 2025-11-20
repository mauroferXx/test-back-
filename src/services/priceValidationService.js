import { Product } from '../models/Product.js';
import { estimatePriceFromCategory } from './priceEstimationService.js';
import pool from '../config/database.js';

/**
 * Servicio de Validación de Precios
 * 
 * Revisa los precios en la base de datos y identifica productos con precios mal puestos:
 * - Precios NULL o 0
 * - Precios negativos
 * - Precios fuera de rangos razonables para su categoría
 * - Precios que no coinciden con el precio determinístico esperado
 */

/**
 * Rangos de precios válidos por categoría (en EUR)
 */
const VALID_PRICE_RANGES = {
  'beverages': { min: 0.5, max: 50.0 },
  'dairy': { min: 0.5, max: 30.0 },
  'snacks': { min: 0.3, max: 25.0 },
  'fruits': { min: 0.5, max: 40.0 },
  'vegetables': { min: 0.3, max: 30.0 },
  'meat': { min: 2.0, max: 100.0 },
  'fish': { min: 3.0, max: 150.0 },
  'bread': { min: 0.5, max: 15.0 },
  'cereals': { min: 1.0, max: 20.0 },
  'default': { min: 0.1, max: 200.0 }
};

/**
 * Obtiene el rango de precios válido para una categoría
 */
function getPriceRangeForCategory(category) {
  if (!category) return VALID_PRICE_RANGES.default;
  
  const categoryLower = category.toLowerCase();
  for (const [key, range] of Object.entries(VALID_PRICE_RANGES)) {
    if (key !== 'default' && categoryLower.includes(key)) {
      return range;
    }
  }
  return VALID_PRICE_RANGES.default;
}

/**
 * Valida si un precio es correcto para un producto
 */
function validatePrice(product) {
  const issues = [];
  const price = parseFloat(product.price);
  
  // Verificar si el precio es NULL o no existe
  if (product.price === null || product.price === undefined) {
    issues.push({
      type: 'missing_price',
      severity: 'high',
      message: 'El producto no tiene precio asignado',
      currentPrice: null,
      recommendedPrice: null
    });
    return { isValid: false, issues };
  }
  
  // Verificar si el precio es 0 o negativo
  if (isNaN(price) || price <= 0) {
    issues.push({
      type: 'invalid_price',
      severity: 'high',
      message: `El precio es inválido: ${product.price}`,
      currentPrice: product.price,
      recommendedPrice: null
    });
    return { isValid: false, issues };
  }
  
  // DETECCIÓN CRÍTICA: Precios que parecen estar en moneda local (CLP/ARS) en lugar de EUR
  // Los precios en EUR para productos de consumo deberían estar entre 0.1 y 200 EUR
  // Si un precio es mayor a 200, probablemente está en moneda local
  if (price > 200) {
    issues.push({
      type: 'likely_wrong_currency',
      severity: 'high',
      message: `El precio ${price.toFixed(2)} parece estar en moneda local (CLP/ARS) en lugar de EUR. Los precios en EUR deberían estar entre 0.1 y 200 EUR.`,
      currentPrice: price,
      recommendedPrice: null,
      note: 'Este precio será corregido calculando el precio determinístico en EUR'
    });
    // No retornar aquí, continuar con otras validaciones
  }
  
  // Verificar si el precio está dentro del rango válido para la categoría
  const category = product.category || product.categories_tags?.[0] || '';
  const validRange = getPriceRangeForCategory(category);
  
  if (price < validRange.min || price > validRange.max) {
    issues.push({
      type: 'out_of_range',
      severity: price > 200 ? 'high' : 'medium', // Alta severidad si parece estar en moneda local
      message: `El precio ${price.toFixed(2)} EUR está fuera del rango válido [${validRange.min}-${validRange.max}] para la categoría "${category}"`,
      currentPrice: price,
      recommendedPrice: null,
      validRange: validRange
    });
  }
  
  // Calcular el precio determinístico esperado y comparar
  try {
    const normalizedProduct = normalizeProductForPriceEstimation(product);
    const expectedPriceInfo = estimatePriceFromCategory(normalizedProduct, null);
    const expectedPrice = expectedPriceInfo.amount;
    const priceDifference = Math.abs(price - expectedPrice);
    const priceDifferencePercent = (priceDifference / expectedPrice) * 100;
    
    // Si la diferencia es mayor al 50%, considerar que el precio está mal
    if (priceDifferencePercent > 50) {
      issues.push({
        type: 'mismatch_with_expected',
        severity: 'medium',
        message: `El precio actual (${price.toFixed(2)} EUR) difiere significativamente del precio determinístico esperado (${expectedPrice.toFixed(2)} EUR)`,
        currentPrice: price,
        recommendedPrice: expectedPrice,
        differencePercent: priceDifferencePercent.toFixed(2)
      });
    }
  } catch (error) {
    console.error(`Error calculating expected price for product ${product.id}:`, error);
  }
  
  return {
    isValid: issues.length === 0,
    issues: issues.length > 0 ? issues : []
  };
}

/**
 * Revisa todos los productos en la base de datos y retorna un reporte
 */
export async function validateAllPrices(options = {}) {
  const {
    limit = null,
    offset = 0,
    fixPrices = false,
    onlyInvalid = false
  } = options;
  
  try {
    // Obtener productos de la base de datos
    let query = 'SELECT * FROM products_cache';
    const queryParams = [];
    
    if (onlyInvalid) {
      // Incluir precios NULL, 0, negativos, demasiado bajos (< 0.5 EUR) o demasiado altos (> 200 EUR)
      query += ' WHERE price IS NULL OR price <= 0 OR price < 0.5 OR price > 200';
    }
    
    query += ' ORDER BY id';
    
    if (limit) {
      query += ` LIMIT $${queryParams.length + 1}`;
      queryParams.push(limit);
    }
    
    if (offset > 0) {
      query += ` OFFSET $${queryParams.length + 1}`;
      queryParams.push(offset);
    }
    
    const result = await pool.query(query, queryParams);
    const products = result.rows;
    
    const report = {
      totalProducts: products.length,
      validProducts: 0,
      invalidProducts: 0,
      productsWithIssues: [],
      summary: {
        missingPrice: 0,
        invalidPrice: 0,
        outOfRange: 0,
        mismatchWithExpected: 0
      },
      fixedPrices: []
    };
    
    // Validar cada producto
    for (const product of products) {
      const validation = validatePrice(product);
      
      if (validation.isValid) {
        report.validProducts++;
      } else {
        report.invalidProducts++;
        report.productsWithIssues.push({
          id: product.id,
          barcode: product.barcode,
          name: product.name,
          category: product.category,
          currentPrice: product.price,
          issues: validation.issues
        });
        
        // Actualizar resumen
        validation.issues.forEach(issue => {
          if (issue.type === 'missing_price') report.summary.missingPrice++;
          else if (issue.type === 'invalid_price') report.summary.invalidPrice++;
          else if (issue.type === 'out_of_range') report.summary.outOfRange++;
          else if (issue.type === 'mismatch_with_expected') report.summary.mismatchWithExpected++;
          else if (issue.type === 'likely_wrong_currency') {
            // Tratar como precio inválido para corrección
            report.summary.invalidPrice++;
          }
        });
        
        // Si se solicita corregir precios, intentar corregirlos
        if (fixPrices) {
          const fixedPrice = await fixProductPrice(product);
          if (fixedPrice) {
            report.fixedPrices.push({
              id: product.id,
              barcode: product.barcode,
              name: product.name,
              oldPrice: product.price,
              newPrice: fixedPrice
            });
          }
        }
      }
    }
    
    return report;
  } catch (error) {
    console.error('Error validating prices:', error);
    throw error;
  }
}

/**
 * Normaliza un producto de la BD para que sea compatible con estimatePriceFromCategory
 */
function normalizeProductForPriceEstimation(product) {
  // Si openfoodfacts_data es un string JSON, parsearlo
  let openfoodfactsData = product.openfoodfacts_data;
  if (typeof openfoodfactsData === 'string') {
    try {
      openfoodfactsData = JSON.parse(openfoodfactsData);
    } catch (e) {
      openfoodfactsData = {};
    }
  }
  
  // Construir objeto normalizado
  const normalized = {
    barcode: product.barcode,
    name: product.name,
    category: product.category,
    categories: product.category,
    categories_tags: product.category ? [product.category] : []
  };
  
  // Si hay openfoodfacts_data, intentar extraer categorías de ahí
  if (openfoodfactsData && typeof openfoodfactsData === 'object') {
    if (openfoodfactsData.categories_tags && Array.isArray(openfoodfactsData.categories_tags)) {
      normalized.categories_tags = openfoodfactsData.categories_tags;
    }
    if (openfoodfactsData.categories) {
      normalized.categories = openfoodfactsData.categories;
    }
  }
  
  return normalized;
}

/**
 * Corrige el precio de un producto calculando el precio determinístico
 */
export async function fixProductPrice(product) {
  try {
    // Normalizar producto para que sea compatible con estimatePriceFromCategory
    const normalizedProduct = normalizeProductForPriceEstimation(product);
    
    // Calcular precio determinístico esperado
    const expectedPriceInfo = estimatePriceFromCategory(normalizedProduct, null);
    const newPrice = expectedPriceInfo.amount;
    
    // Actualizar en la base de datos
    await pool.query(
      'UPDATE products_cache SET price = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newPrice, product.id]
    );
    
    return newPrice;
  } catch (error) {
    console.error(`Error fixing price for product ${product.id}:`, error);
    return null;
  }
}

/**
 * Corrige múltiples productos a la vez
 */
export async function fixMultiplePrices(productIds) {
  const results = {
    fixed: [],
    failed: []
  };
  
  for (const productId of productIds) {
    try {
      const product = await Product.findById(productId);
      if (!product) {
        results.failed.push({ id: productId, reason: 'Product not found' });
        continue;
      }
      
      const newPrice = await fixProductPrice(product);
      if (newPrice) {
        results.fixed.push({ id: productId, newPrice });
      } else {
        results.failed.push({ id: productId, reason: 'Failed to calculate price' });
      }
    } catch (error) {
      results.failed.push({ id: productId, reason: error.message });
    }
  }
  
  return results;
}

/**
 * Obtiene estadísticas de precios en la base de datos
 */
export async function getPriceStatistics() {
  try {
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_products,
        COUNT(price) as products_with_price,
        COUNT(*) - COUNT(price) as products_without_price,
        COUNT(CASE WHEN price <= 0 THEN 1 END) as products_with_invalid_price,
        AVG(price) as average_price,
        MIN(price) as min_price,
        MAX(price) as max_price,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price) as median_price
      FROM products_cache
    `);
    
    return stats.rows[0];
  } catch (error) {
    console.error('Error getting price statistics:', error);
    throw error;
  }
}

