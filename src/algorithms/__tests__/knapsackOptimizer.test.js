import { optimizeShoppingList, hybridOptimization } from '../knapsackOptimizer.js';
import { calculateSustainabilityScore } from '../sustainabilityScoring.js';

describe('Knapsack Optimizer', () => {
  const createMockProduct = (id, price, score, carbon = 1.0) => ({
    id,
    name: `Product ${id}`,
    price,
    quantity: 1,
    carbon_footprint: carbon,
    sustainability_score: {
      total: score,
      breakdown: { economic: score * 0.4, environmental: score * 0.4, social: score * 0.2 }
    }
  });

  test('should optimize list within budget', () => {
    const products = [
      createMockProduct(1, 10, 0.9),
      createMockProduct(2, 15, 0.8),
      createMockProduct(3, 20, 0.7),
      createMockProduct(4, 5, 0.6)
    ];

    const maxBudget = 25;
    const result = optimizeShoppingList(products, maxBudget);

    expect(result).toHaveProperty('selected');
    expect(result).toHaveProperty('totalCost');
    expect(result).toHaveProperty('totalScore');
    expect(result.totalCost).toBeLessThanOrEqual(maxBudget);
    expect(result.selected.length).toBeGreaterThan(0);
  });

  test('should respect minimum score requirement', () => {
    const products = [
      createMockProduct(1, 10, 0.3),
      createMockProduct(2, 15, 0.7),
      createMockProduct(3, 20, 0.9)
    ];

    const maxBudget = 50;
    const options = { minScore: 0.5 };
    const result = optimizeShoppingList(products, maxBudget, options);

    result.selected.forEach(product => {
      expect(product.sustainability_score.total).toBeGreaterThanOrEqual(0.5);
    });
  });

  test('should calculate savings correctly', () => {
    const products = [
      createMockProduct(1, 10, 0.9),
      createMockProduct(2, 15, 0.8),
      createMockProduct(3, 20, 0.7)
    ];

    const maxBudget = 15;
    const result = optimizeShoppingList(products, maxBudget);

    expect(result).toHaveProperty('savings');
    expect(result.savings).toHaveProperty('economic');
    expect(result.savings).toHaveProperty('carbon');
  });

  test('should handle empty product list', () => {
    const result = optimizeShoppingList([], 100);
    
    expect(result.selected).toHaveLength(0);
    expect(result.totalCost).toBe(0);
    expect(result.message).toContain('No hay productos válidos');
  });

  test('should handle products without prices', () => {
    const products = [
      createMockProduct(1, 10, 0.9),
      { ...createMockProduct(2, null, 0.8), price: null },
      createMockProduct(3, 15, 0.7)
    ];

    const result = optimizeShoppingList(products, 30);
    
    // Solo debe incluir productos con precio
    result.selected.forEach(product => {
      expect(product.price).toBeDefined();
      expect(product.price).not.toBeNull();
    });
  });

  test('hybrid optimization should work', () => {
    const products = Array.from({ length: 25 }, (_, i) => 
      createMockProduct(i + 1, (i + 1) * 2, 0.5 + (i % 5) * 0.1)
    );

    const result = hybridOptimization(products, 100, 0.4);
    
    expect(result).toHaveProperty('selected');
    expect(result.selected.length).toBeGreaterThan(0);
  });
});

