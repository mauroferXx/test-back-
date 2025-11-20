import {
  validateAllPrices,
  fixProductPrice,
  fixMultiplePrices,
  getPriceStatistics
} from '../services/priceValidationService.js';
import { Product } from '../models/Product.js';

/**
 * Controlador para validación y corrección de precios
 */

/**
 * Obtiene estadísticas generales de precios
 */
export async function getPriceStatisticsController(req, res) {
  try {
    const statistics = await getPriceStatistics();
    res.json({
      success: true,
      statistics
    });
  } catch (error) {
    console.error('Error getting price statistics:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener estadísticas de precios',
      message: error.message
    });
  }
}

/**
 * Revisa todos los precios y genera un reporte
 */
export async function validatePricesController(req, res) {
  try {
    const {
      limit = null,
      offset = 0,
      onlyInvalid = false
    } = req.query;

    const options = {
      limit: limit ? parseInt(limit) : null,
      offset: parseInt(offset),
      onlyInvalid: onlyInvalid === 'true',
      fixPrices: false // Solo revisar, no corregir
    };

    const report = await validateAllPrices(options);

    res.json({
      success: true,
      report
    });
  } catch (error) {
    console.error('Error validating prices:', error);
    res.status(500).json({
      success: false,
      error: 'Error al validar precios',
      message: error.message
    });
  }
}

/**
 * Revisa y corrige precios automáticamente
 */
export async function fixPricesController(req, res) {
  try {
    const {
      limit = null,
      offset = 0,
      onlyInvalid = true
    } = req.query;

    const options = {
      limit: limit ? parseInt(limit) : null,
      offset: parseInt(offset),
      onlyInvalid: onlyInvalid === 'true' || onlyInvalid === true,
      fixPrices: true // Corregir precios
    };

    const report = await validateAllPrices(options);

    res.json({
      success: true,
      message: `Se revisaron ${report.totalProducts} productos. Se corrigieron ${report.fixedPrices.length} precios.`,
      report
    });
  } catch (error) {
    console.error('Error fixing prices:', error);
    res.status(500).json({
      success: false,
      error: 'Error al corregir precios',
      message: error.message
    });
  }
}

/**
 * Corrige el precio de un producto específico
 */
export async function fixProductPriceController(req, res) {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'ID de producto es requerido'
      });
    }

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Producto no encontrado'
      });
    }

    const newPrice = await fixProductPrice(product);

    if (!newPrice) {
      return res.status(500).json({
        success: false,
        error: 'No se pudo calcular el precio para este producto'
      });
    }

    res.json({
      success: true,
      message: 'Precio corregido exitosamente',
      product: {
        id: product.id,
        barcode: product.barcode,
        name: product.name,
        oldPrice: product.price,
        newPrice: newPrice
      }
    });
  } catch (error) {
    console.error('Error fixing product price:', error);
    res.status(500).json({
      success: false,
      error: 'Error al corregir precio del producto',
      message: error.message
    });
  }
}

/**
 * Corrige múltiples productos por sus IDs
 */
export async function fixMultiplePricesController(req, res) {
  try {
    const { productIds } = req.body;

    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere un array de IDs de productos'
      });
    }

    const results = await fixMultiplePrices(productIds);

    res.json({
      success: true,
      message: `Se corrigieron ${results.fixed.length} productos de ${productIds.length} solicitados`,
      results
    });
  } catch (error) {
    console.error('Error fixing multiple prices:', error);
    res.status(500).json({
      success: false,
      error: 'Error al corregir precios',
      message: error.message
    });
  }
}

/**
 * Obtiene productos con precios problemáticos
 */
export async function getInvalidPricesController(req, res) {
  try {
    const { limit = 100, offset = 0 } = req.query;

    const products = await Product.findProductsWithInvalidPrices(
      parseInt(limit),
      parseInt(offset)
    );

    res.json({
      success: true,
      count: products.length,
      products
    });
  } catch (error) {
    console.error('Error getting invalid prices:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener productos con precios inválidos',
      message: error.message
    });
  }
}

