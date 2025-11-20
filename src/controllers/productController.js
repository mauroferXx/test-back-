import { Product } from '../models/Product.js';
import { getProductByBarcode, searchProducts as searchOpenFoodFacts } from '../services/openFoodFactsService.js';
import { calculateCarbonFootprint } from '../services/carbonInterfaceService.js';
import { calculateSustainabilityScore } from '../algorithms/sustainabilityScoring.js';

/**
 * Buscar producto por código de barras
 */
export async function getProductByBarcodeController(req, res) {
  try {
    const { barcode } = req.params;
    const { country } = req.query;

    if (!barcode) {
      return res.status(400).json({ error: 'Barcode is required' });
    }

    let product = await Product.findByBarcode(barcode);

    if (!product) {
      const openFoodFactsProduct = await getProductByBarcode(barcode);

      if (!openFoodFactsProduct) {
        return res.status(404).json({ error: 'Product not found' });
      }

      const carbonFootprint = await calculateCarbonFootprint(openFoodFactsProduct);
      openFoodFactsProduct.carbon_footprint = carbonFootprint;

      const { estimatePriceFromCategory } = await import('../services/priceEstimationService.js');
      const basePriceInfo = estimatePriceFromCategory(openFoodFactsProduct, null);
      openFoodFactsProduct.price = basePriceInfo.amount;
      openFoodFactsProduct.country = country || null; // Guardar país de la búsqueda

      product = await Product.create(openFoodFactsProduct);
    }

    let priceInfo;
    try {
      const { getProductPrice } = await import('../services/priceService.js');
      priceInfo = await getProductPrice(product, country || null);
    } catch (priceError) {
      console.error('Error getting product price:', priceError);
      priceInfo = {
        amount: product.price || 0,
        currency: 'EUR',
        symbol: '€',
        source: 'default'
      };
    }

    let sustainabilityScore;
    try {
      sustainabilityScore = calculateSustainabilityScore(product);
    } catch (scoreError) {
      console.error('Error calculating sustainability score:', scoreError);
      sustainabilityScore = { total: 0, breakdown: { economic: 0, environmental: 0, social: 0 } };
    }

    res.json({
      ...product,
      price: priceInfo.amount,
      currency: priceInfo.currency,
      currency_symbol: priceInfo.symbol,
      price_source: priceInfo.source || 'estimated',
      sustainability_score: sustainabilityScore
    });
  } catch (error) {
    console.error('Error in getProductByBarcodeController:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

/**
 * Buscar productos por nombre
 * NUEVA LÓGICA: Popular BD con 100 productos de Open Food Facts
 */
export async function searchProductsController(req, res) {
  try {
    const { query, page = 1, pageSize = 20, country } = req.query;

    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const pageNum = parseInt(page);
    const pageSizeNum = parseInt(pageSize);
    const offset = (pageNum - 1) * pageSizeNum;

    console.log(`Searching for: "${query}" (page ${pageNum}, pageSize ${pageSizeNum}, country: ${country || 'all'})`);

    // 1. Buscar en BD con paginación optimizada (solo lo necesario)
    // Priorizar productos del país seleccionado si se especifica
    let dbProducts = await Product.search(query, pageSizeNum * 2, 0, country || null); // Buscar un poco más para tener buffer
    const totalInDB = await Product.countSearch(query, country || null);
    
    console.log(`Found ${dbProducts.length} products in database (total: ${totalInDB})`);

    // 2. Si hay pocos resultados en BD, consultar Open Food Facts
    // Si la BD está vacía o tiene muy pocos resultados, esperar la respuesta para devolver productos inmediatamente
    // Si hay algunos resultados pero no suficientes, hacerlo en background
    const shouldWaitForOpenFoodFacts = totalInDB < pageSizeNum; // Si hay menos productos que el tamaño de página
    
    if (totalInDB < 50) {
      if (shouldWaitForOpenFoodFacts) {
        // BD vacía o con muy pocos resultados: esperar Open Food Facts y devolver esos productos
        console.log(`Database has insufficient results (${totalInDB} < ${pageSizeNum}). Waiting for Open Food Facts...`);
        try {
          const apiResult = await searchOpenFoodFacts(query, 1, Math.max(50, pageSizeNum * 3), country || null);

          if (apiResult.products && apiResult.products.length > 0) {
            console.log(`Open Food Facts returned ${apiResult.products.length} products`);

            // Guardar productos con precios normalizados inmediatamente
            const savedProducts = [];
            const existingBarcodes = new Set(dbProducts.map(p => p.barcode));
            const newProducts = apiResult.products.filter(apiProduct =>
              apiProduct.barcode && !existingBarcodes.has(apiProduct.barcode)
            );

            if (newProducts.length > 0) {
              console.log(`Saving ${newProducts.length} new products to database with normalized prices...`);

              // Guardar en lotes para no saturar
              for (let i = 0; i < newProducts.length; i += 10) {
                const batch = newProducts.slice(i, i + 10);
                const savedBatch = await Promise.all(
                  batch.map(async (product) => {
                    try {
                      // Estimar precio base en EUR (sin conversión) - Product.create ya normaliza
                      if (!product.price) {
                        const { estimatePriceFromCategory } = await import('../services/priceEstimationService.js');
                        const basePriceInfo = estimatePriceFromCategory(product, null);
                        product.price = basePriceInfo.amount; // Siempre en EUR
                      }

                      // Guardar con país de la búsqueda
                      product.country = country || null;

                      // Product.create() ya normaliza precios y sanitiza campos
                      const savedProduct = await Product.create(product);
                      return savedProduct;
                    } catch (err) {
                      if (!err.message.includes('duplicate key')) {
                        console.error(`Error saving product ${product.barcode}:`, err.message);
                      }
                      return null;
                    }
                  })
                );
                savedProducts.push(...savedBatch.filter(p => p !== null));
              }
              console.log(`✓ Successfully saved ${savedProducts.length} products to database`);
            }

            // Usar productos guardados + productos de Open Food Facts para la respuesta
            // Combinar productos guardados con los de la API (por si algunos no se guardaron)
            const allProducts = [...savedProducts, ...apiResult.products];
            
            // Eliminar duplicados por barcode
            const uniqueProducts = Array.from(
              new Map(allProducts.map(p => [p.barcode || p.id, p])).values()
            );

            // Paginar los productos combinados
            dbProducts = uniqueProducts.slice(offset, offset + pageSizeNum);
            const totalProducts = uniqueProducts.length;
            
            // Calcular scores y precios para productos paginados
            const { getProductPrice } = await import('../services/priceService.js');
            const productsWithData = await Promise.all(
              dbProducts.map(async (product) => {
                // Calcular score
                const score = calculateSustainabilityScore(product);
                
                // Obtener precio (ya normalizado en BD, solo convierte según país)
                const priceInfo = await getProductPrice(product, country || null);

                return {
                  ...product,
                  price: priceInfo.amount,
                  currency: priceInfo.currency,
                  currency_symbol: priceInfo.symbol,
                  sustainability_score: score
                };
              })
            );

            return res.json({
              products: productsWithData,
              total: totalProducts,
              page: pageNum,
              pageSize: pageSizeNum,
              source: 'openfoodfacts'
            });
          }
        } catch (apiError) {
          console.error('Error fetching from Open Food Facts:', apiError);
          // Continuar con productos de BD (aunque sean 0)
        }
      } else {
        // Hay algunos resultados pero no suficientes: hacer en background
        (async () => {
          try {
            console.log(`Fetching from Open Food Facts in background to populate database...`);
            const apiResult = await searchOpenFoodFacts(query, 1, 50, country || null);

            if (apiResult.products && apiResult.products.length > 0) {
              console.log(`Open Food Facts returned ${apiResult.products.length} products`);

              const existingBarcodes = new Set(dbProducts.map(p => p.barcode));
              const newProducts = apiResult.products.filter(apiProduct =>
                apiProduct.barcode && !existingBarcodes.has(apiProduct.barcode)
              );

              if (newProducts.length > 0) {
                console.log(`Saving ${newProducts.length} new products to database in background...`);

                for (let i = 0; i < newProducts.length; i += 10) {
                  const batch = newProducts.slice(i, i + 10);
                  await Promise.all(
                    batch.map(async (product) => {
                      try {
                        if (!product.price) {
                          const { estimatePriceFromCategory } = await import('../services/priceEstimationService.js');
                          const basePriceInfo = estimatePriceFromCategory(product, null);
                          product.price = basePriceInfo.amount;
                        }
                        product.country = country || null;
                        await Product.create(product);
                      } catch (err) {
                        if (!err.message.includes('duplicate key')) {
                          console.error(`Error saving product ${product.barcode}:`, err.message);
                        }
                      }
                    })
                  );
                }
                console.log(`✓ Successfully saved ${newProducts.length} products to database`);
              }
            }
          } catch (apiError) {
            console.error('Error fetching from Open Food Facts (background):', apiError);
          }
        })();
      }
    }

    // 3. Paginar resultados de BD
    const paginatedProducts = dbProducts.slice(0, pageSizeNum);

    // 4. Calcular scores y precios SOLO para productos paginados (en paralelo)
    const { getProductPrice } = await import('../services/priceService.js');
    const productsWithData = await Promise.all(
      paginatedProducts.map(async (product) => {
        // Calcular score (rápido, no hace llamadas externas)
        const score = calculateSustainabilityScore(product);
        
        // Obtener precio (optimizado - usa precio base en EUR y convierte)
        const priceInfo = await getProductPrice(product, country || null);

        return {
          ...product,
          price: priceInfo.amount,
          currency: priceInfo.currency,
          currency_symbol: priceInfo.symbol,
          sustainability_score: score
        };
      })
    );

    res.json({
      products: productsWithData,
      total: totalInDB,
      page: pageNum,
      pageSize: pageSizeNum,
      source: 'database'
    });
  } catch (error) {
    console.error('Error in searchProductsController:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}

/**
 * Asegurar que un producto exista en la BD (crear si no existe)
 * Útil cuando se agrega un producto desde la búsqueda y necesita ID para alternativas
 */
export async function ensureProductExistsController(req, res) {
  try {
    const productData = req.body;

    if (!productData.barcode) {
      return res.status(400).json({ error: 'Barcode is required' });
    }

    // Buscar si ya existe en BD
    let product = await Product.findByBarcode(productData.barcode);

    if (product) {
      // Ya existe, calcular score y retornar
      const score = calculateSustainabilityScore(product);
      return res.json({
        ...product,
        sustainability_score: score
      });
    }

    // No existe, crear el producto
    console.log(`Creating product in cache: ${productData.name} (${productData.barcode})`);

    // Asegurar que tenga precio en EUR
    if (!productData.price) {
      const { estimatePriceFromCategory } = await import('../services/priceEstimationService.js');
      const basePriceInfo = estimatePriceFromCategory(productData, null);
      productData.price = basePriceInfo.amount; // Siempre en EUR
    }

    // Extraer país de la búsqueda si está en los datos de Open Food Facts
    // O usar el país del query si está disponible
    if (!productData.country && productData.openfoodfacts_data?.countries_tags) {
      // Tomar el primer país de la lista
      const countries = productData.openfoodfacts_data.countries_tags;
      if (Array.isArray(countries) && countries.length > 0) {
        productData.country = countries[0];
      }
    }

    // Calcular carbon_footprint si no existe (opcional, puede ser null)
    if (!productData.carbon_footprint) {
      try {
        productData.carbon_footprint = await calculateCarbonFootprint(productData);
      } catch (err) {
        console.warn('Could not calculate carbon footprint:', err.message);
        productData.carbon_footprint = null;
      }
    }

    // Crear producto en BD
    product = await Product.create(productData);

    // Calcular score
    const score = calculateSustainabilityScore(product);

    res.json({
      ...product,
      sustainability_score: score
    });
  } catch (error) {
    console.error('Error in ensureProductExistsController:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}

/**
 * Obtener producto por ID
 */
export async function getProductByIdController(req, res) {
  try {
    const { id } = req.params;
    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const sustainabilityScore = calculateSustainabilityScore(product);

    res.json({
      ...product,
      sustainability_score: sustainabilityScore
    });
  } catch (error) {
    console.error('Error in getProductByIdController:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
