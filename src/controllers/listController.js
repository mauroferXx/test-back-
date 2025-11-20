import { ShoppingList } from '../models/ShoppingList.js';
import { Product } from '../models/Product.js';
import { calculateScoresForProducts, calculateSustainabilityScore } from '../algorithms/sustainabilityScoring.js';
import { optimizeShoppingList } from '../algorithms/knapsackOptimizer.js';
import { findSmartSubstitutes } from '../algorithms/smartSubstitution.js';
import { searchProducts as searchOpenFoodFacts } from '../services/openFoodFactsService.js';
import { estimatePriceFromCategory } from '../services/priceEstimationService.js';

/**
 * Función compartida para buscar sustitutos de un producto
 * REUTILIZADA por optimizeListController y getSubstitutesController
 * @param {Object} product - Producto para el cual buscar sustitutos
 * @param {string} country - País para conversión de precios
 * @returns {Promise<Array>} Array de sustitutos válidos
 */
async function findSubstitutesForProduct(product, country = null) {
  // Asegurar que el producto tenga precio convertido según el país
  // Si el producto no tiene precio convertido, convertirlo ahora
  let productWithPrice = { ...product };
  if (!productWithPrice.currency || productWithPrice.currency === 'EUR' || !country) {
    try {
      const { getProductPrice } = await import('../services/priceService.js');
      const priceInfo = await getProductPrice(product, country || null);
      productWithPrice = {
        ...productWithPrice,
        price: parseFloat(priceInfo.amount || productWithPrice.price || 0),
        currency: priceInfo.currency || 'EUR',
        currency_symbol: priceInfo.symbol || '€'
      };
    } catch (err) {
      console.warn(`Could not convert price for product ${product.id || product.name}:`, err.message);
    }
  }

  // Usar la misma lógica de búsqueda
  // Búsqueda más amplia: buscar por varias palabras del nombre
  const words = productWithPrice.name.toLowerCase().split(' ').filter(w => w.length > 3);
  const searchTerms = words.slice(0, 2); // Primeras 2 palabras significativas

  let allCandidates = [];
  for (const term of searchTerms) {
    const results = await Product.search(term, 50, 0, country || null);
    allCandidates = [...allCandidates, ...results];
  }

  // Eliminar duplicados por ID
  let uniqueCandidates = Array.from(new Map(allCandidates.map(p => [p.id, p])).values());

  // Si hay pocos candidatos en BD, buscar más en Open Food Facts y guardarlos
  if (uniqueCandidates.length < 10) {
    try {
      const { searchProducts } = await import('../services/openFoodFactsService.js');
      const { calculateCarbonFootprint } = await import('../services/carbonFootprintService.js');
      const { estimatePriceFromCategory } = await import('../services/priceEstimationService.js');
      
      const searchQuery = searchTerms.join(' ');
      const offResults = await searchProducts(searchQuery, 1, 20, country || null);
      
      if (offResults.products && offResults.products.length > 0) {
        const existingBarcodes = new Set(uniqueCandidates.map(p => p.barcode).filter(Boolean));
        const newCandidates = [];

        for (const apiProduct of offResults.products) {
          if (!apiProduct.barcode || existingBarcodes.has(apiProduct.barcode)) {
            continue;
          }

          try {
            let productToSave = { ...apiProduct };

            // Calcular carbon_footprint si no existe
            if (!productToSave.carbon_footprint) {
              productToSave.carbon_footprint = await calculateCarbonFootprint(productToSave);
            }

            // Estimar precio base en EUR si no existe
            if (!productToSave.price) {
              const basePriceInfo = estimatePriceFromCategory(productToSave, null);
              productToSave.price = basePriceInfo.amount;
            }

            const savedProduct = await Product.create({
              ...productToSave,
              price: productToSave.price,
              carbon_footprint: productToSave.carbon_footprint || null,
              country: country || null,
              openfoodfacts_data: productToSave.openfoodfacts_data || {}
            });

            newCandidates.push(savedProduct);
            existingBarcodes.add(savedProduct.barcode);
          } catch (saveError) {
            if (!saveError.message?.includes('duplicate key')) {
              console.error(`Error saving product ${apiProduct.barcode} from Open Food Facts:`, saveError.message);
            }
          }
        }

        if (newCandidates.length > 0) {
          uniqueCandidates = [...uniqueCandidates, ...newCandidates];
          console.log(`Added ${newCandidates.length} new candidates from Open Food Facts`);
        }
      }
    } catch (extraError) {
      console.error('Error fetching extra substitutes from Open Food Facts:', extraError.message);
    }
  }

  console.log(`Searching substitutes for "${product.name}" found ${uniqueCandidates.length} candidates`);

  // Calcular scores para todos los candidatos
  const candidatesWithScores = calculateScoresForProducts(uniqueCandidates);

  // Convertir precios de candidatos según país
  const { getProductPrice } = await import('../services/priceService.js');
  const candidatesWithPrices = await Promise.all(
    candidatesWithScores.map(async (candidate) => {
      try {
        const candidatePriceInfo = await getProductPrice(candidate, country || null);
        return {
          ...candidate,
          price: parseFloat(candidatePriceInfo.amount || candidate.price || 0),
          currency: candidatePriceInfo.currency || 'EUR',
          currency_symbol: candidatePriceInfo.symbol || '€'
        };
      } catch (err) {
        return {
          ...candidate,
          price: parseFloat(candidate.price || 0),
          currency: 'EUR',
          currency_symbol: '€'
        };
      }
    })
  );

  // Encontrar sustitutos válidos usando los mismos criterios
  // Usar productWithPrice que tiene el precio convertido correctamente
  const substitutes = findSmartSubstitutes(productWithPrice, candidatesWithPrices, {
    minScoreImprovement: 0.05, // 5% mejora mínima
    sameCategory: true, // Activar comparación inteligente de categorías
    maxResults: 5
  });

  console.log(`Found ${substitutes.length} valid substitutes for "${productWithPrice.name}"`);
  if (substitutes.length > 0) {
    console.log(`Best substitute: "${substitutes[0].name}" with score ${(substitutes[0].sustainability_score.total * 100).toFixed(0)}% and price ${substitutes[0].price} ${substitutes[0].currency}`);
  }

  return substitutes;
}

/**
 * Crear nueva lista de compras
 */
export async function createListController(req, res) {
  try {
    const { userId, name, budget } = req.body;

    if (!userId || !name || !budget) {
      return res.status(400).json({ error: 'userId, name, and budget are required' });
    }

    // Verificar o crear usuario si no existe
    const { User } = await import('../models/User.js');
    let user = await User.findById(userId);
    if (!user) {
      // Crear usuario por defecto si no existe
      // Usar createOrGet que maneja mejor la creación
      try {
        user = await User.createOrGet(
          userId,
          `user${userId}@example.com`,
          `Usuario ${userId}`
        );
        console.log('Created/retrieved user:', user);
      } catch (userError) {
        console.error('Error creating user:', userError);
        // Continuar de todas formas, el error podría ser que el usuario ya existe
        user = await User.findById(userId);
        if (!user) {
          throw new Error(`Could not create or find user with id ${userId}`);
        }
      }
    }

    const list = await ShoppingList.create(userId, name, parseFloat(budget));
    res.status(201).json(list);
  } catch (error) {
    console.error('Error in createListController:', error);
    console.error('Error details:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

/**
 * Obtener lista por ID
 */
export async function getListByIdController(req, res) {
  try {
    const { id } = req.params;
    const list = await ShoppingList.findById(id);

    if (!list) {
      return res.status(404).json({ error: 'List not found' });
    }

    const items = await ShoppingList.getItems(id);
    res.json({ ...list, items });
  } catch (error) {
    console.error('Error in getListByIdController:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Agregar producto a lista
 */
export async function addItemToListController(req, res) {
  try {
    const { listId } = req.params;
    const { productId, quantity = 1 } = req.body;

    if (!productId) {
      return res.status(400).json({ error: 'productId is required' });
    }

    const item = await ShoppingList.addItem(listId, productId, quantity);
    res.status(201).json(item);
  } catch (error) {
    console.error('Error in addItemToListController:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Optimizar lista de compras
 */
export async function optimizeListController(req, res) {
  try {
    const { id } = req.params;
    const { options = {} } = req.body;

    const list = await ShoppingList.findById(id);
    if (!list) {
      return res.status(404).json({ error: 'List not found' });
    }

    // Obtener items de la lista
    const items = await ShoppingList.getItems(id);
    console.log(`List ${id} has ${items.length} items`);

    if (items.length === 0) {
      return res.status(400).json({
        error: 'List is empty',
        message: 'No products found in the list. Make sure products are added to the list before optimizing.'
      });
    }

    // Obtener país de query params si está disponible (para conversión de precios)
    const { country } = req.query;

    // Calcular scores y convertir precios según país
    const { getProductPrice } = await import('../services/priceService.js');
    const productsWithScores = await Promise.all(
      items.map(async (item) => {
        // Calcular score
        const score = calculateSustainabilityScore(item);

        // Convertir precio según país
        let priceInfo;
        try {
          priceInfo = await getProductPrice(item, country || null);
        } catch (err) {
          console.error('Error getting product price:', err);
          priceInfo = {
            amount: parseFloat(item.price || 0),
            currency: 'EUR',
            symbol: '€',
            source: 'default'
          };
        }

        return {
          ...item,
          price: parseFloat(priceInfo.amount || item.price || 0), // Asegurar que sea número
          currency: priceInfo.currency || 'EUR',
          currency_symbol: priceInfo.symbol || '€',
          sustainability_score: score
        };
      })
    );

    // Optimizar: Estrategia de Sustitución Inteligente (Smart Swap)
    // 1. Para cada producto, buscar sustitutos
    // 2. Intentar mejorar el score cambiando por sustitutos si el presupuesto lo permite

    const { Product } = await import('../models/Product.js');
    const { calculateScoresForProducts } = await import('../algorithms/sustainabilityScoring.js');

    // Copia de trabajo para la optimización
    let currentItems = [...productsWithScores];
    let currentCost = currentItems.reduce((sum, p) => sum + (p.price * (p.quantity || 1)), 0);
    const maxBudget = parseFloat(list.budget);

    // Buscar sustitutos para cada item en paralelo
    // REUTILIZAR LA MISMA FUNCIÓN QUE getSubstitutesController
    const itemsWithSubstitutes = await Promise.all(currentItems.map(async (item) => {
      try {
        // Usar la función compartida findSubstitutesForProduct
        const substitutes = await findSubstitutesForProduct(item, country || null);
        return { item, substitutes };
      } catch (err) {
        console.error(`Error finding substitutes for ${item.name}:`, err);
        return { item, substitutes: [] };
      }
    }));

    // Aplicar sustituciones
    // findSmartSubstitutes ahora devuelve 3 opciones (económico, ambiental, social)
    // Seleccionar automáticamente la mejor opción para la optimización
    const optimizedItems = itemsWithSubstitutes.map(({ item, substitutes }) => {
      if (!substitutes || substitutes.length === 0) return item;

      // findSmartSubstitutes devuelve hasta 3 opciones con recommendationType
      // Seleccionar la mejor: priorizar score total, luego precio
      const sortedSubstitutes = substitutes
        .filter(sub => {
          // Solo considerar sustitutos que mejoren o igualen el score total
          const subTotal = sub.sustainability_score?.total || 0;
          const itemTotal = item.sustainability_score?.total || 0;
          return subTotal >= itemTotal - 0.02; // Permitir hasta 2% peor
        })
        .sort((a, b) => {
          // Priorizar mejor score total
          const aTotal = a.sustainability_score?.total || 0;
          const bTotal = b.sustainability_score?.total || 0;
          if (Math.abs(aTotal - bTotal) > 0.01) {
            return bTotal - aTotal;
          }
          // Si scores similares, priorizar más barato
          return a.price - b.price;
        });

      const bestSubstitute = sortedSubstitutes[0];

      // Si no hay mejor sustituto, mantener original
      if (!bestSubstitute) return item;

      // Verificar que no sea el mismo producto (por ID, barcode o nombre)
      if (bestSubstitute.id === item.id || 
          bestSubstitute.barcode === item.barcode ||
          (bestSubstitute.name || '').toLowerCase().trim() === (item.name || '').toLowerCase().trim()) {
        console.log(`✗ Keeping "${item.name}" - substitute is the same product`);
        return item;
      }

      // Calcular diferencia de costo
      // IMPORTANTE: Ambos precios deben estar en la misma moneda
      const originalCost = item.price * (item.quantity || 1);
      const substituteCost = bestSubstitute.price * (item.quantity || 1);
      const costDiff = substituteCost - originalCost;

      // Lógica de decisión:
      // 1. Si mejora score y es más barato (Win-Win) -> CAMBIAR
      // 2. Si mejora score y es más caro -> CAMBIAR SOLO SI HAY PRESUPUESTO

      const scoreImprovement = bestSubstitute.sustainability_score.total - item.sustainability_score.total;

      if (scoreImprovement > 0) {
        if (costDiff <= 0) {
          // Es más barato o igual, y mejor score: Cambiar siempre
          currentCost += costDiff;
          console.log(`✓ Swapping "${item.name}" for "${bestSubstitute.name}" (cheaper & better)`);
          return { ...bestSubstitute, quantity: item.quantity, improvement: scoreImprovement };
        } else if (currentCost + costDiff <= maxBudget) {
          // Es más caro, pero cabe en el presupuesto: Cambiar
          currentCost += costDiff;
          console.log(`✓ Swapping "${item.name}" for "${bestSubstitute.name}" (better score, within budget)`);
          return { ...bestSubstitute, quantity: item.quantity, improvement: scoreImprovement };
        } else {
          console.log(`✗ Keeping "${item.name}" - substitute would exceed budget`);
        }
      } else {
        console.log(`✗ Keeping "${item.name}" - substitute does not improve score`);
      }

      return item;
    });

    // Si después de los swaps seguimos dentro del presupuesto, esa es nuestra lista optimizada.
    // Si nos pasamos (o si queremos filtrar items de bajo valor), podríamos pasar una segunda pasada de Knapsack.
    // Pero por ahora, asumimos que el usuario quiere mantener todos los items si es posible.

    // Recalcular totales finales
    const finalSelected = optimizedItems;
    const finalTotalCost = finalSelected.reduce((sum, p) => sum + (p.price * (p.quantity || 1)), 0);
    const finalTotalScore = finalSelected.reduce((sum, p) => sum + (p.sustainability_score.total * (p.quantity || 1)), 0);
    const finalTotalCarbon = finalSelected.reduce((sum, p) => sum + (parseFloat(p.carbon_footprint || 0) * (p.quantity || 1)), 0);

    // Calcular ahorros
    const originalCost = productsWithScores.reduce((sum, p) => sum + (p.price * (p.quantity || 1)), 0);
    const originalCarbon = productsWithScores.reduce((sum, p) => sum + (parseFloat(p.carbon_footprint || 0) * (p.quantity || 1)), 0);

    const optimized = {
      selected: finalSelected,
      totalCost: Math.round(finalTotalCost * 100) / 100,
      totalScore: Math.round((finalTotalScore / finalSelected.reduce((sum, p) => sum + (p.quantity || 1), 0)) * 100) / 100, // Promedio
      totalCarbon: Math.round(finalTotalCarbon * 100) / 100,
      savings: {
        economic: Math.max(0, Math.round((originalCost - finalTotalCost) * 100) / 100),
        carbon: Math.max(0, Math.round((originalCarbon - finalTotalCarbon) * 100) / 100),
        percentage: originalCost > 0 ? Math.round(((originalCost - finalTotalCost) / originalCost) * 100) : 0
      },
      budgetUsed: Math.round((finalTotalCost / maxBudget) * 100) / 100,
      message: 'Lista optimizada con sustituciones inteligentes'
    };

    // Actualizar estado de la lista
    await ShoppingList.updateStatus(id, 'optimized');

    res.json({
      listId: id,
      original: {
        items: productsWithScores,
        totalCost: originalCost,
        totalCarbon: originalCarbon,
        totalScore: productsWithScores.reduce((sum, p) => sum + (p.sustainability_score.total * (p.quantity || 1)), 0) / productsWithScores.reduce((sum, p) => sum + (p.quantity || 1), 0)
      },
      optimized
    });
  } catch (error) {
    console.error('Error in optimizeListController:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Obtener sustitutos inteligentes para un producto
 * Usa la misma lógica que optimizeListController para consistencia
 */
export async function getSubstitutesController(req, res) {
  try {
    const { productId } = req.params;
    const { country } = req.query;

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Calcular score del producto
    const { calculateSustainabilityScore, calculateScoresForProducts } = await import('../algorithms/sustainabilityScoring.js');
    const productScore = calculateSustainabilityScore(product);
    product.sustainability_score = productScore;

    // Convertir precio según país si está disponible
    let priceInfo;
    try {
      const { getProductPrice } = await import('../services/priceService.js');
      priceInfo = await getProductPrice(product, country || null);
    } catch (err) {
      console.error('Error getting product price:', err);
      priceInfo = {
        amount: parseFloat(product.price || 0),
        currency: 'EUR',
        symbol: '€',
        source: 'default'
      };
    }

    const productWithPrice = {
      ...product,
      price: parseFloat(priceInfo.amount || product.price || 0),
      currency: priceInfo.currency || 'EUR',
      currency_symbol: priceInfo.symbol || '€'
    };

    // REUTILIZAR LA MISMA FUNCIÓN QUE optimizeListController
    const substitutes = await findSubstitutesForProduct(productWithPrice, country || null);

    res.json({
      original: productWithPrice,
      substitutes
    });
  } catch (error) {
    console.error('Error in getSubstitutesController:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

