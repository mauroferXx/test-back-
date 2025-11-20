import { Purchase } from '../models/Purchase.js';

/**
 * Registrar una compra
 */
export async function createPurchaseController(req, res) {
  try {
    const { userId, listId, items, totalPrice, totalCarbon, totalSavings } = req.body;

    if (!userId || !items || !totalPrice) {
      return res.status(400).json({ error: 'userId, items, and totalPrice are required' });
    }

    const purchase = await Purchase.create(
      userId,
      listId,
      parseFloat(totalPrice),
      totalCarbon ? parseFloat(totalCarbon) : null,
      totalSavings ? parseFloat(totalSavings) : null
    );

    // Agregar items de la compra
    for (const item of items) {
      await Purchase.addItem(
        purchase.id,
        item.productId,
        item.quantity,
        item.price
      );
    }

    res.status(201).json(purchase);
  } catch (error) {
    console.error('Error in createPurchaseController:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Obtener historial de compras de un usuario
 */
export async function getPurchaseHistoryController(req, res) {
  try {
    const { userId } = req.params;
    const purchases = await Purchase.findByUserId(userId);
    res.json(purchases);
  } catch (error) {
    console.error('Error in getPurchaseHistoryController:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

