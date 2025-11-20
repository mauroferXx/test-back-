/**
 * Algoritmo de Mochila (Knapsack) Multi-objetivo
 * Optimiza la selección de productos respetando el presupuesto máximo
 * y maximizando el score de sostenibilidad
 */

/**
 * Optimiza una lista de productos usando Knapsack Multi-objetivo
 * @param {Array} products - Lista de productos con sus scores y precios
 * @param {Number} maxBudget - Presupuesto máximo
 * @param {Object} options - Opciones de optimización
 * @returns {Object} Lista optimizada y estadísticas
 */
export function optimizeShoppingList(products, maxBudget, options = {}) {
  const {
    minScore = 0,
    prioritizeSustainability = true,
    allowPartial = false
  } = options;

  // Validar que todos los productos tengan precio y score
  const validProducts = products.filter(p => 
    p.price && 
    p.sustainability_score && 
    p.sustainability_score.total !== undefined
  );

  if (validProducts.length === 0) {
    return {
      selected: [],
      totalCost: 0,
      totalScore: 0,
      totalCarbon: 0,
      savings: { economic: 0, carbon: 0 },
      message: 'No hay productos válidos para optimizar'
    };
  }

  // Ordenar productos por ratio score/precio (greedy approach mejorado)
  const productsWithRatio = validProducts.map(product => ({
    ...product,
    ratio: product.sustainability_score.total / product.price
  }));

  // Usar algoritmo híbrido: Greedy + Dynamic Programming
  const result = prioritizeSustainability 
    ? greedyOptimization(productsWithRatio, maxBudget, minScore)
    : dynamicProgrammingOptimization(productsWithRatio, maxBudget, minScore);

  // Calcular estadísticas
  const totalCost = result.selected.reduce((sum, p) => sum + (p.price * (p.quantity || 1)), 0);
  const totalScore = result.selected.reduce((sum, p) => sum + (p.sustainability_score.total * (p.quantity || 1)), 0);
  const totalCarbon = result.selected.reduce((sum, p) => sum + (parseFloat(p.carbon_footprint || 0) * (p.quantity || 1)), 0);

  // Calcular ahorros comparado con lista original
  const originalCost = products.reduce((sum, p) => sum + (p.price * (p.quantity || 1)), 0);
  const originalCarbon = products.reduce((sum, p) => sum + (parseFloat(p.carbon_footprint || 0) * (p.quantity || 1)), 0);

  return {
    selected: result.selected,
    totalCost: Math.round(totalCost * 100) / 100,
    totalScore: Math.round(totalScore * 100) / 100,
    totalCarbon: Math.round(totalCarbon * 100) / 100,
    savings: {
      economic: Math.max(0, Math.round((originalCost - totalCost) * 100) / 100),
      carbon: Math.max(0, Math.round((originalCarbon - totalCarbon) * 100) / 100),
      percentage: originalCost > 0 ? Math.round(((originalCost - totalCost) / originalCost) * 100) : 0
    },
    budgetUsed: Math.round((totalCost / maxBudget) * 100) / 100,
    message: result.message || 'Lista optimizada exitosamente'
  };
}

/**
 * Optimización Greedy (rápida, buena para listas grandes)
 */
function greedyOptimization(products, maxBudget, minScore) {
  // Ordenar por ratio descendente
  const sorted = [...products].sort((a, b) => b.ratio - a.ratio);

  const selected = [];
  let remainingBudget = maxBudget;

  for (const product of sorted) {
    const cost = product.price * (product.quantity || 1);
    const score = product.sustainability_score.total;

    if (cost <= remainingBudget && score >= minScore) {
      selected.push(product);
      remainingBudget -= cost;
    }
  }

  return {
    selected,
    message: `Seleccionados ${selected.length} productos usando algoritmo Greedy`
  };
}

/**
 * Optimización con Programación Dinámica (óptima, pero más lenta)
 * Usa 0/1 Knapsack con aproximación para valores decimales
 */
function dynamicProgrammingOptimization(products, maxBudget, minScore) {
  // Filtrar productos que cumplen score mínimo
  const validProducts = products.filter(p => p.sustainability_score.total >= minScore);

  if (validProducts.length === 0) {
    return { selected: [], message: 'Ningún producto cumple el score mínimo requerido' };
  }

  // Convertir presupuesto a centavos para trabajar con enteros
  const budgetCents = Math.floor(maxBudget * 100);
  
  // Crear tabla DP: dp[i][w] = máximo score con primeros i productos y presupuesto w
  const n = validProducts.length;
  const dp = Array(n + 1).fill(null).map(() => Array(budgetCents + 1).fill(0));
  const selected = Array(n + 1).fill(null).map(() => Array(budgetCents + 1).fill(false));

  // Llenar tabla DP
  for (let i = 1; i <= n; i++) {
    const product = validProducts[i - 1];
    const costCents = Math.floor(product.price * (product.quantity || 1) * 100);
    const score = product.sustainability_score.total;

    for (let w = 0; w <= budgetCents; w++) {
      // No tomar el producto
      dp[i][w] = dp[i - 1][w];
      selected[i][w] = false;

      // Tomar el producto si cabe en el presupuesto
      if (w >= costCents) {
        const scoreWithProduct = dp[i - 1][w - costCents] + score;
        if (scoreWithProduct > dp[i][w]) {
          dp[i][w] = scoreWithProduct;
          selected[i][w] = true;
        }
      }
    }
  }

  // Reconstruir solución
  const result = [];
  let w = budgetCents;

  for (let i = n; i > 0; i--) {
    if (selected[i][w]) {
      result.push(validProducts[i - 1]);
      const costCents = Math.floor(validProducts[i - 1].price * (validProducts[i - 1].quantity || 1) * 100);
      w -= costCents;
    }
  }

  return {
    selected: result.reverse(),
    message: `Seleccionados ${result.length} productos usando Programación Dinámica`
  };
}

/**
 * Optimización híbrida (combina ambos métodos)
 */
export function hybridOptimization(products, maxBudget, minScore) {
  // Si hay pocos productos, usar DP
  if (products.length <= 20) {
    return dynamicProgrammingOptimization(products, maxBudget, minScore);
  }
  
  // Si hay muchos productos, usar Greedy
  return greedyOptimization(products, maxBudget, minScore);
}

