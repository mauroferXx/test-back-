import { calculateSustainabilityScore, calculateScoresForProducts } from '../sustainabilityScoring.js';

describe('Sustainability Scoring Algorithm', () => {
  const mockProduct = {
    price: 5.50,
    nutrition_grade: 'A',
    eco_score: 'B',
    carbon_footprint: 1.2,
    openfoodfacts_data: {
      packaging: 'Reciclable',
      origins: 'España',
      labels_tags: ['organic', 'fair trade'],
      additives: []
    }
  };

  test('should calculate sustainability score correctly', () => {
    const result = calculateSustainabilityScore(mockProduct);
    
    expect(result).toHaveProperty('total');
    expect(result).toHaveProperty('breakdown');
    expect(result.total).toBeGreaterThanOrEqual(0);
    expect(result.total).toBeLessThanOrEqual(1);
    expect(result.breakdown.economic).toBeGreaterThanOrEqual(0);
    expect(result.breakdown.environmental).toBeGreaterThanOrEqual(0);
    expect(result.breakdown.social).toBeGreaterThanOrEqual(0);
  });

  test('should handle product without price', () => {
    const productWithoutPrice = { ...mockProduct, price: null };
    const result = calculateSustainabilityScore(productWithoutPrice);
    
    expect(result.total).toBeGreaterThanOrEqual(0);
    expect(result.total).toBeLessThanOrEqual(1);
  });

  test('should calculate higher score for better eco_score', () => {
    const productA = { ...mockProduct, eco_score: 'A' };
    const productE = { ...mockProduct, eco_score: 'E' };
    
    const scoreA = calculateSustainabilityScore(productA);
    const scoreE = calculateSustainabilityScore(productE);
    
    expect(scoreA.total).toBeGreaterThan(scoreE.total);
  });

  test('should calculate scores for multiple products', () => {
    const products = [
      mockProduct,
      { ...mockProduct, price: 3.00, eco_score: 'A' },
      { ...mockProduct, price: 10.00, eco_score: 'D' }
    ];

    const results = calculateScoresForProducts(products);
    
    expect(results).toHaveLength(3);
    results.forEach(product => {
      expect(product).toHaveProperty('sustainability_score');
      expect(product.sustainability_score.total).toBeGreaterThanOrEqual(0);
    });
  });

  test('should apply custom weights correctly', () => {
    const customWeights = { economic: 0.6, environmental: 0.3, social: 0.1 };
    const result = calculateSustainabilityScore(mockProduct, customWeights);
    
    expect(result.weights).toEqual(customWeights);
  });
});

