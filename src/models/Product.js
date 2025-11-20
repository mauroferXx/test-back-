import pool from '../config/database.js';
import { normalizePriceToEUR } from '../utils/priceNormalization.js';

export class Product {
  static async findByBarcode(barcode) {
    const result = await pool.query(
      'SELECT * FROM products_cache WHERE barcode = $1',
      [barcode]
    );
    return result.rows[0] || null;
  }

  static async findById(id) {
    const result = await pool.query(
      'SELECT * FROM products_cache WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  static sanitizeProductData(data) {
    const truncate = (value, maxLength) => {
      if (!value || typeof value !== 'string') return value || null;
      return value.length > maxLength ? value.slice(0, maxLength) : value;
    };

    return {
      ...data,
      barcode: truncate(data.barcode ? String(data.barcode) : null, 255),
      name: truncate(data.name || data.product_name || '', 500),
      brand: truncate(data.brand || data.brands || '', 255),
      category: truncate(data.category || data.categories || '', 255),
      nutrition_grade: data.nutrition_grade
        ? String(data.nutrition_grade).charAt(0).toUpperCase()
        : (data.nutriscore_grade ? String(data.nutriscore_grade).charAt(0).toUpperCase() : null),
      eco_score: data.eco_score
        ? String(data.eco_score).charAt(0).toUpperCase()
        : (data.ecoscore_grade ? String(data.ecoscore_grade).charAt(0).toUpperCase() : null),
      image_url: truncate(data.image_url || data.image || '', 2048)
    };
  }

  static async create(productData) {
    const normalizedData = normalizePriceToEUR(productData);
    let sanitizedData = Product.sanitizeProductData(normalizedData);
    let {
      barcode,
      name,
      brand,
      category,
      price,
      image_url,
      nutrition_grade,
      eco_score,
      carbon_footprint,
      country,
      openfoodfacts_data
    } = sanitizedData;

    // Asegurar que siempre haya un precio válido antes de guardar
    if (!price || price <= 0) {
      try {
        const { estimatePriceFromCategory } = await import('../services/priceEstimationService.js');
        const priceInfo = estimatePriceFromCategory(normalizedData, null);
        price = priceInfo.amount;
      } catch (error) {
        console.warn(`Could not estimate price for product ${barcode || name}, using default`);
        price = 2.0; // Precio por defecto en EUR
      }
    }

    const openFoodFactsPayload = typeof openfoodfacts_data === 'string'
      ? openfoodfacts_data
      : JSON.stringify(openfoodfacts_data || {});

    const result = await pool.query(
      `INSERT INTO products_cache 
       (barcode, name, brand, category, price, image_url, nutrition_grade, eco_score, carbon_footprint, country, openfoodfacts_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (barcode) 
       DO UPDATE SET 
         name = EXCLUDED.name,
         brand = EXCLUDED.brand,
         category = EXCLUDED.category,
         price = EXCLUDED.price,
         image_url = EXCLUDED.image_url,
         nutrition_grade = EXCLUDED.nutrition_grade,
         eco_score = EXCLUDED.eco_score,
         carbon_footprint = EXCLUDED.carbon_footprint,
         country = COALESCE(EXCLUDED.country, products_cache.country),
         openfoodfacts_data = EXCLUDED.openfoodfacts_data,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [barcode, name, brand, category, price, image_url, nutrition_grade, eco_score, carbon_footprint, country || null, openFoodFactsPayload]
    );
    return result.rows[0];
  }

  static async search(query, limit = 20, offset = 0, country = null) {
    // Si se especifica país, priorizar productos de ese país
    if (country && country !== 'all') {
      const result = await pool.query(
        `SELECT * FROM products_cache 
         WHERE (name ILIKE $1 OR brand ILIKE $1)
         ORDER BY 
           CASE WHEN country = $3 THEN 0 ELSE 1 END,
           name
         LIMIT $2 OFFSET $4`,
        [`%${query}%`, limit, country, offset]
      );
      return result.rows;
    }
    
    // Búsqueda sin filtro de país
    const result = await pool.query(
      `SELECT * FROM products_cache 
       WHERE name ILIKE $1 OR brand ILIKE $1
       ORDER BY name
       LIMIT $2 OFFSET $3`,
      [`%${query}%`, limit, offset]
    );
    return result.rows;
  }

  /**
   * Cuenta el total de productos que coinciden con la búsqueda
   * Nota: Cuenta todos los productos, independientemente del país, para reflejar el total disponible
   */
  static async countSearch(query, country = null) {
    // Siempre contar todos los productos que coinciden, sin filtrar por país
    // El país solo afecta el orden de los resultados, no el total disponible
    const result = await pool.query(
      `SELECT COUNT(*) as total FROM products_cache 
       WHERE name ILIKE $1 OR brand ILIKE $1`,
      [`%${query}%`]
    );
    return parseInt(result.rows[0].total);
  }

  /**
   * Obtiene productos con precios problemáticos (NULL, 0, negativos, o precios > 200 EUR que parecen estar en moneda local)
   */
  static async findProductsWithInvalidPrices(limit = 100, offset = 0) {
    const result = await pool.query(
      `SELECT * FROM products_cache 
       WHERE price IS NULL 
         OR price <= 0 
         OR price < 0.5 
         OR price > 200
       ORDER BY id
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return result.rows;
  }

  /**
   * Obtiene todos los productos con paginación
   */
  static async findAll(limit = 100, offset = 0) {
    const result = await pool.query(
      `SELECT * FROM products_cache 
       ORDER BY id
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return result.rows;
  }

  /**
   * Actualiza el precio de un producto
   */
  static async updatePrice(id, price) {
    const result = await pool.query(
      `UPDATE products_cache 
       SET price = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 
       RETURNING *`,
      [price, id]
    );
    return result.rows[0] || null;
  }
}

