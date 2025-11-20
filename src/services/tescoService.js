import axios from 'axios';

const TESCO_API_BASE_URL = 'https://dev.tescolabs.com';
const TESCO_API_KEY = process.env.TESCO_API_KEY || '';

/**
 * Busca productos en Tesco API
 * Nota: Tesco es principalmente para Reino Unido
 */
export async function searchTescoProducts(query, limit = 20) {
  if (!TESCO_API_KEY) {
    console.warn('Tesco API key not configured');
    return null;
  }

  try {
    const response = await axios.get(`${TESCO_API_BASE_URL}/grocery/products/`, {
      params: {
        query,
        limit,
        offset: 0
      },
      headers: {
        'Ocp-Apim-Subscription-Key': TESCO_API_KEY
      },
      timeout: 10000
    });

    if (!response.data || !response.data.uk || !response.data.uk.ghs) {
      return null;
    }

    return response.data.uk.ghs.results.products.map(product => ({
      name: product.name,
      price: product.price,
      currency: 'GBP',
      currency_symbol: '£',
      image_url: product.image,
      brand: product.brand,
      category: product.category,
      barcode: product.tpnb, // Tesco Product Number
      source: 'tesco'
    }));
  } catch (error) {
    console.error('Error fetching from Tesco API:', error.message);
    return null;
  }
}

/**
 * Obtiene precio de un producto por código de barras en Tesco
 */
export async function getTescoProductByBarcode(barcode) {
  if (!TESCO_API_KEY) {
    return null;
  }

  try {
    // Tesco API usa el endpoint de productos con tpnb (Tesco Product Number)
    // Nota: Puede que necesites usar el endpoint de búsqueda si el barcode no es tpnb
    const response = await axios.get(`${TESCO_API_BASE_URL}/grocery/products/`, {
      params: {
        query: barcode,
        limit: 1
      },
      headers: {
        'Ocp-Apim-Subscription-Key': TESCO_API_KEY
      },
      timeout: 10000
    });

    if (!response.data || !response.data.uk || !response.data.uk.ghs || 
        !response.data.uk.ghs.results || !response.data.uk.ghs.results.products ||
        response.data.uk.ghs.results.products.length === 0) {
      return null;
    }

    const product = response.data.uk.ghs.results.products[0];
    
    // Extraer precio (puede estar en diferentes formatos)
    let price = null;
    if (product.price) {
      price = typeof product.price === 'number' 
        ? product.price 
        : parseFloat(product.price.toString().replace(/[^0-9.]/g, ''));
    }

    if (!price || isNaN(price)) {
      return null;
    }

    return {
      name: product.name,
      price: price,
      currency: 'GBP',
      currency_symbol: '£',
      image_url: product.image,
      brand: product.brand || '',
      barcode: product.tpnb || barcode,
      source: 'tesco'
    };
  } catch (error) {
    console.error('Error fetching product from Tesco API:', error.message);
    return null;
  }
}

