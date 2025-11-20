import { Cart } from '../models/Cart.js';
import { Product } from '../models/Product.js';
import { calculateSustainabilityScore } from '../algorithms/sustainabilityScoring.js';
import { getProductPrice } from '../services/priceService.js';

/**
 * Obtener carrito del usuario
 */
export async function getCartController(req, res) {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const items = await Cart.getItems(userId);

    // Enriquecer items con información completa del producto
    const enrichedItems = await Promise.all(
      items.map(async (item) => {
        const product = await Product.findById(item.product_id);
        if (!product) {
          return null;
        }

        // Calcular precio según país (si se proporciona)
        const { country } = req.query;
        let priceInfo;
        try {
          priceInfo = await getProductPrice(product, country || null);
        } catch (err) {
          priceInfo = {
            amount: product.price || 0,
            currency: 'EUR',
            symbol: '€',
            source: 'default'
          };
        }

        // Calcular score de sostenibilidad
        const sustainabilityScore = calculateSustainabilityScore(product);

        return {
          id: item.id,
          product_id: item.product_id,
          quantity: item.quantity,
          product: {
            ...product,
            price: priceInfo.amount,
            currency: priceInfo.currency,
            currency_symbol: priceInfo.symbol,
            price_source: priceInfo.source,
            sustainability_score: sustainabilityScore
          }
        };
      })
    );

    // Filtrar items nulos
    const validItems = enrichedItems.filter(item => item !== null);

    res.json({ items: validItems });
  } catch (error) {
    console.error('Error in getCartController:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Agregar producto al carrito
 */
export async function addToCartController(req, res) {
  try {
    const { userId, productId, quantity = 1 } = req.body;

    if (!userId || !productId) {
      return res.status(400).json({ error: 'userId and productId are required' });
    }

    // Verificar que el producto existe
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const item = await Cart.addItem(userId, productId, quantity);
    res.status(201).json(item);
  } catch (error) {
    console.error('Error in addToCartController:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Actualizar cantidad de un producto en el carrito
 */
export async function updateCartItemController(req, res) {
  try {
    const { userId, productId, quantity } = req.body;

    if (!userId || !productId || quantity === undefined) {
      return res.status(400).json({ error: 'userId, productId, and quantity are required' });
    }

    const item = await Cart.updateQuantity(userId, productId, quantity);
    res.json({ item });
  } catch (error) {
    console.error('Error in updateCartItemController:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Remover producto del carrito
 */
export async function removeFromCartController(req, res) {
  try {
    const { userId, productId } = req.body;

    if (!userId || !productId) {
      return res.status(400).json({ error: 'userId and productId are required' });
    }

    await Cart.removeItem(userId, productId);
    res.json({ message: 'Item removed from cart' });
  } catch (error) {
    console.error('Error in removeFromCartController:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Limpiar carrito
 */
export async function clearCartController(req, res) {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    await Cart.clear(userId);
    res.json({ message: 'Cart cleared' });
  } catch (error) {
    console.error('Error in clearCartController:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}


