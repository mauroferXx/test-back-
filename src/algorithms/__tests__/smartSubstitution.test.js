import { findSmartSubstitutes, findBestSubstitute } from '../smartSubstitution.js';
import { calculateSustainabilityScore } from '../sustainabilityScoring.js';

describe('Smart Substitution', () => {
  const createMockProduct = (id, price, score, category = 'test') => {
    const product = {
      id,
      name: `Product ${id}`,
      price,
      category,
      carbon_footprint: 1.0,
      sustainability_score: {
        total: score,
        breakdown: { economic: score * 0.4, environmental: score * 0.4, social: score * 0.2 }
      }
    };
    return product;
  };

  test('should find substitutes with better score', () => {
    const originalProduct = createMockProduct(1, 10, 0.5);
    const availableProducts = [
      createMockProduct(2, 12, 0.7),
      createMockProduct(3, 15, 0.8),
      createMockProduct(4, 8, 0.4) // Peor score, no debería incluirse
    ];

    const substitutes = findSmartSubstitutes(originalProduct, availableProducts, {
      minScoreImprovement: 0.1,
      sameCategory: false,
      maxResults: 5
    });

    expect(substitutes.length).toBeGreaterThan(0);
    substitutes.forEach(sub => {
      expect(sub.sustainability_score.total).toBeGreaterThan(originalProduct.sustainability_score.total);
    });
  });

  test('should respect same category filter', () => {
    const originalProduct = createMockProduct(1, 10, 0.5, 'fruits');
    const availableProducts = [
      createMockProduct(2, 12, 0.7, 'fruits'),
      createMockProduct(3, 15, 0.8, 'vegetables'),
      createMockProduct(4, 11, 0.75, 'fruits')
    ];

    const substitutes = findSmartSubstitutes(originalProduct, availableProducts, {
      minScoreImprovement: 0.1,
      sameCategory: true,
      maxResults: 5
    });

    substitutes.forEach(sub => {
      expect(sub.category).toBe('fruits');
    });
  });

  test('should respect max price increase', () => {
    const originalProduct = createMockProduct(1, 10, 0.5);
    const availableProducts = [
      createMockProduct(2, 12, 0.7), // 20% más caro, OK
      createMockProduct(3, 15, 0.8), // 50% más caro, debería excluirse
      createMockProduct(4, 11, 0.75) // 10% más caro, OK
    ];

    const substitutes = findSmartSubstitutes(originalProduct, availableProducts, {
      minScoreImprovement: 0.1,
      maxPriceIncrease: 0.2,
      maxResults: 5
    });

    substitutes.forEach(sub => {
      const priceIncrease = (sub.price - originalProduct.price) / originalProduct.price;
      expect(priceIncrease).toBeLessThanOrEqual(0.2);
    });
  });

  test('should not include original product', () => {
    const originalProduct = createMockProduct(1, 10, 0.5);
    const availableProducts = [
      originalProduct, // Mismo producto
      createMockProduct(2, 12, 0.7)
    ];

    const substitutes = findSmartSubstitutes(originalProduct, availableProducts);

    substitutes.forEach(sub => {
      expect(sub.id).not.toBe(originalProduct.id);
    });
  });

  test('should return empty array if no substitutes found', () => {
    const originalProduct = createMockProduct(1, 10, 0.9);
    const availableProducts = [
      createMockProduct(2, 12, 0.5), // Peor score
      createMockProduct(3, 15, 0.6) // Peor score
    ];

    const substitutes = findSmartSubstitutes(originalProduct, availableProducts, {
      minScoreImprovement: 0.1
    });

    expect(substitutes).toHaveLength(0);
  });

  test('findBestSubstitute should return best option', () => {
    const originalProduct = createMockProduct(1, 10, 0.5);
    const availableProducts = [
      createMockProduct(2, 12, 0.7),
      createMockProduct(3, 11, 0.75), // Mejor ratio
      createMockProduct(4, 15, 0.8)
    ];

    const best = findBestSubstitute(originalProduct, availableProducts);

    expect(best).not.toBeNull();
    expect(best.sustainability_score.total).toBeGreaterThan(originalProduct.sustainability_score.total);
  });
});

