import axios from 'axios';

// Base URL - remover /api/v0 si está presente (solo se usa /api/v0 para obtener productos por código de barras)
let baseUrl = process.env.OPEN_FOOD_FACTS_BASE_URL || 'https://world.openfoodfacts.org';
// Asegurarse de que no termine en /api/v0 para búsquedas
baseUrl = baseUrl.replace(/\/api\/v0\/?$/, '');
const OPEN_FOOD_FACTS_BASE_URL = baseUrl;

/**
 * Busca un producto por código de barras
 */
export async function getProductByBarcode(barcode) {
  try {
    const response = await axios.get(`${OPEN_FOOD_FACTS_BASE_URL}/api/v0/product/${barcode}.json`);
    
    if (response.data.status === 0) {
      return null; // Producto no encontrado
    }

    return normalizeProductData(response.data.product);
  } catch (error) {
    console.error('Error fetching product from Open Food Facts:', error.message);
    throw new Error('Failed to fetch product from Open Food Facts');
  }
}

/**
 * Busca productos por nombre
 */
export async function searchProducts(query, page = 1, pageSize = 20, country = null) {
  try {
    // Construir URL manualmente para asegurar formato correcto
    // Open Food Facts es sensible al formato de la URL
    const encodedQuery = encodeURIComponent(query);
    let searchUrl = `${OPEN_FOOD_FACTS_BASE_URL}/cgi/search.pl?search_terms=${encodedQuery}&page_size=${pageSize}&page=${page}&json=1&action=process`;
    
    // Agregar filtro de país si se proporciona
    if (country && country !== 'all') {
      // Open Food Facts usa countries_tags para filtrar por país
      searchUrl += `&countries_tags=${encodeURIComponent(country)}`;
    }
    
    console.log('Open Food Facts URL:', searchUrl);
    console.log('Country filter:', country || 'all');
    
    const response = await axios.get(searchUrl, {
      timeout: 45000, // 45 segundos de timeout (aumentado para conexiones lentas)
      headers: {
        'User-Agent': 'SustainableShopping/1.0',
        'Accept': 'application/json'
      },
      // No usar params, construir URL manualmente
      validateStatus: function (status) {
        return status < 500; // Aceptar cualquier status menor a 500
      }
    });

    console.log('=== Open Food Facts Response ===');
    console.log('Query:', query);
    console.log('Has data:', !!response.data);
    console.log('Response keys:', response.data ? Object.keys(response.data) : 'no data');
    console.log('Has products:', !!(response.data && response.data.products));
    console.log('Products count:', response.data?.products?.length || 0);
    console.log('Count field:', response.data?.count);
    console.log('Status field:', response.data?.status);
    
    if (response.data && response.data.products && response.data.products.length > 0) {
      console.log('First product sample:', {
        code: response.data.products[0].code,
        name: response.data.products[0].product_name,
        hasName: !!(response.data.products[0].product_name || response.data.products[0].product_name_en)
      });
    }

    if (!response.data || !response.data.products || response.data.products.length === 0) {
      console.log('❌ Open Food Facts: No products found for query:', query);
      console.log('Response data:', JSON.stringify(response.data, null, 2).substring(0, 500));
      return { products: [], total: 0, page, pageSize };
    }

    console.log(`Open Food Facts: Found ${response.data.products.length} products for query: ${query}`);

    // Filtrar productos que tengan al menos un nombre (más flexible)
    // Asegurarse de que el código no sea vacío o undefined
    const validProducts = response.data.products.filter(p => {
      // Verificar nombre en cualquier idioma
      const hasName = !!(p.product_name || p.product_name_en || p.product_name_fr || p.product_name_es || p.product_name_de);
      // Verificar código (debe ser string no vacío)
      const code = p.code || p.barcode;
      const hasCode = !!(code && String(code).trim() !== '');
      const isValid = hasName && hasCode;
      
      if (!isValid && response.data.products.length <= 10) {
        // Solo loggear si hay pocos productos para no saturar
        console.log('Filtered out product:', { 
          hasName, 
          hasCode, 
          code: code,
          codeType: typeof code,
          name: p.product_name || p.product_name_en || p.product_name_es 
        });
      }
      return isValid;
    });

    console.log(`After filtering: ${validProducts.length} valid products out of ${response.data.products.length}`);

    if (validProducts.length === 0 && response.data.products.length > 0) {
      // Si todos fueron filtrados, mostrar ejemplo del primer producto
      const firstProduct = response.data.products[0];
      console.log('Example of filtered product:', {
        code: firstProduct.code,
        codeType: typeof firstProduct.code,
        product_name: firstProduct.product_name,
        product_name_en: firstProduct.product_name_en,
        product_name_es: firstProduct.product_name_es,
        hasCode: !!(firstProduct.code || firstProduct.barcode),
        hasName: !!(firstProduct.product_name || firstProduct.product_name_en || firstProduct.product_name_fr || firstProduct.product_name_es)
      });
    }

    const normalizedProducts = validProducts.map(normalizeProductData);
    console.log(`Normalized products: ${normalizedProducts.length}`);
    
    // Agregar precios (intentar reales primero, luego estimar)
    // Primero, verificar si los productos ya están en caché con precios
    const { Product } = await import('../models/Product.js');
    const productsWithPrices = await Promise.all(
      normalizedProducts.map(async (product) => {
        // Buscar en caché si existe
        let cachedProduct = null;
        if (product.barcode) {
          cachedProduct = await Product.findByBarcode(product.barcode);
        }
        
        // Si está en caché y tiene precio, usar ese precio base
        if (cachedProduct && cachedProduct.price) {
          product.price = cachedProduct.price; // Precio base en EUR
        } else {
          // Calcular precio base determinístico y guardarlo si no existe
          const { estimatePriceFromCategory } = await import('./priceEstimationService.js');
          const basePriceInfo = estimatePriceFromCategory(product, null); // null = EUR base
          product.price = basePriceInfo.amount;
          
          // Guardar en caché si tiene barcode
          if (product.barcode && !cachedProduct) {
            try {
              await Product.create({
                ...product,
                price: basePriceInfo.amount,
                carbon_footprint: null,
                country: country || null, // Guardar país de la búsqueda
                openfoodfacts_data: product.openfoodfacts_data || {}
              });
            } catch (error) {
              console.log('Error saving product to cache:', error.message);
            }
          }
        }
        
        // Obtener precio convertido según país
        const priceInfo = await getRealPrice(product, country);
        return {
          ...product,
          price: priceInfo.amount,
          currency: priceInfo.currency,
          currency_symbol: priceInfo.symbol,
          price_source: priceInfo.source || 'estimated'
        };
      })
    );

    return {
      products: productsWithPrices,
      total: response.data.count || normalizedProducts.length,
      page,
      pageSize
    };
  } catch (error) {
    console.error('Error searching products from Open Food Facts:', error.message);
    if (error.code === 'ECONNABORTED') {
      console.error('Request timeout - Open Food Facts took too long to respond');
    } else if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    // En lugar de lanzar error, retornar array vacío para no bloquear
    // Esto permite que la búsqueda en BD continúe funcionando
    console.warn('Returning empty results due to Open Food Facts error');
    return { products: [], total: 0, page, pageSize };
  }
}

/**
 * Normaliza los datos del producto de Open Food Facts
 */
function normalizeProductData(product) {
  // Obtener nombre (probar varios idiomas)
  const name = product.product_name || 
               product.product_name_en || 
               product.product_name_fr || 
               product.product_name_es || 
               product.product_name_de ||
               'Unknown Product';

    // Obtener código de barras
    const barcode = product.code || product.barcode || `OFF-${Date.now()}-${Math.random()}`;

    return {
      barcode,
      name,
      brand: product.brands || product.brand || '',
      category: product.categories || product.categories_tags?.[0] || product.categories_hierarchy?.[0] || '',
      image_url: product.image_url || 
                 product.image_front_url || 
                 product.image_front_small_url || 
                 product.image_small_url ||
                 '',
      nutrition_grade: product.nutriscore_grade?.toUpperCase() || null,
      eco_score: product.ecoscore_grade?.toUpperCase() || null,
      carbon_footprint: product.carbon_footprint_from_ingredients_debugged || null,
      // NOTA: Open Food Facts NO proporciona precios
      // El precio se estimará después basándose en categoría y país
      price: null, // Open Food Facts no tiene precios
      openfoodfacts_data: {
      ingredients: product.ingredients_text || '',
      allergens: product.allergens || '',
      additives: product.additives_tags || [],
      packaging: product.packaging || '',
      labels: product.labels_tags || [],
      origins: product.origins || '',
      manufacturing_places: product.manufacturing_places || ''
    }
  };
}

/**
 * NOTA: La lógica de precios se movió a priceEstimationService.js
 * Este servicio (openFoodFactsService) solo maneja información nutricional
 * 
 * Para precios, usar: import { estimatePriceFromCategory } from './priceEstimationService.js'
 */

/**
 * Intenta obtener precio real de APIs externas antes de estimar
 * Exportada para uso en otros módulos
 */
export async function getRealPrice(product, country = null) {
  // Redirigir a priceService
  const { getProductPrice } = await import('./priceService.js');
  return await getProductPrice(product, country);
}

/**
 * DEPRECATED: Esta función se movió a priceEstimationService.js
 * 
 * Mantenida temporalmente para compatibilidad, pero debería usar:
 * import { estimatePriceFromCategory } from './priceEstimationService.js'
 * 
 * @deprecated Use priceEstimationService.estimatePriceFromCategory() instead
 */
export function estimatePriceFromCategory(product, country = null) {
  const { estimatePriceFromCategory: estimate } = require('./priceEstimationService.js');
  return estimate(product, country);
}

