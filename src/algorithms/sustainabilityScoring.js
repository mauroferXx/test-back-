/**
 * Algoritmo de Scoring de Sostenibilidad Multi-objetivo
 * Calcula una puntuación que combina aspectos económicos, ambientales y sociales
 */

/**
 * Calcula el score de sostenibilidad para un producto
 * @param {Object} product - Producto con sus datos
 * @param {Object} weights - Pesos para cada dimensión {economic: 0.4, environmental: 0.4, social: 0.2}
 * @returns {Object} Score total y desglose por dimensiones
 */
export function calculateSustainabilityScore(product, weights = { economic: 0.4, environmental: 0.4, social: 0.2 }) {
  const economicScore = calculateEconomicScore(product);
  const environmentalScore = calculateEnvironmentalScore(product);
  const socialScore = calculateSocialScore(product);

  const totalScore = (
    economicScore * weights.economic +
    environmentalScore * weights.environmental +
    socialScore * weights.social
  );

  return {
    total: Math.round(totalScore * 100) / 100, // Redondeo a 2 decimales
    breakdown: {
      economic: Math.round(economicScore * 100) / 100,
      environmental: Math.round(environmentalScore * 100) / 100,
      social: Math.round(socialScore * 100) / 100
    },
    weights
  };
}

/**
 * Score económico (0-1)
 * Basado en precio relativo y valor nutricional
 */
function calculateEconomicScore(product) {
  let score = 0.5; // Base score

  // Si no hay precio, asumimos precio medio (score neutral)
  if (!product.price) {
    return 0.5;
  }

  // Normalización de precio (asumiendo rango típico de 1-50€)
  // Precios más bajos = mejor score económico
  const normalizedPrice = Math.min(product.price / 50, 1);
  score = 1 - normalizedPrice;

  // Bonus por buen valor nutricional
  const nutritionGrade = product.nutrition_grade;
  if (nutritionGrade === 'A' || nutritionGrade === 'B') {
    score += 0.1;
  }

  return Math.max(0, Math.min(1, score));
}

/**
 * Score ambiental (0-1)
 * Basado en huella de carbono, eco_score, y packaging
 */
function calculateEnvironmentalScore(product) {
  let score = 0.5; // Base score

  // Eco Score de Open Food Facts (A=1.0, E=0.0)
  const ecoScoreMap = { 'A': 1.0, 'B': 0.8, 'C': 0.6, 'D': 0.4, 'E': 0.2 };
  if (product.eco_score) {
    score = ecoScoreMap[product.eco_score] || 0.5;
  }

  // Ajuste por huella de carbono
  if (product.carbon_footprint) {
    const carbon = parseFloat(product.carbon_footprint);
    // Normalización: < 1kg CO2 = excelente, > 5kg CO2 = malo
    const carbonScore = Math.max(0, 1 - (carbon / 5));
    score = (score * 0.7) + (carbonScore * 0.3);
  }

  // Bonus por packaging sostenible
  const packaging = (product.openfoodfacts_data?.packaging || '').toLowerCase();
  if (packaging.includes('reciclable') || packaging.includes('biodegradable')) {
    score += 0.1;
  }

  // Bonus por origen local
  const origins = product.openfoodfacts_data?.origins || '';
  if (origins && !origins.toLowerCase().includes('import')) {
    score += 0.05;
  }

  return Math.max(0, Math.min(1, score));
}

/**
 * Score social (0-1)
 * Basado en etiquetas, origen, y prácticas sociales
 */
function calculateSocialScore(product) {
  let score = 0.5; // Base score

  const labels = product.openfoodfacts_data?.labels_tags || [];
  const labelText = labels.join(' ').toLowerCase();

  // Bonus por etiquetas sociales
  if (labelText.includes('fair trade') || labelText.includes('comercio justo')) {
    score += 0.3;
  }
  if (labelText.includes('organic') || labelText.includes('bio') || labelText.includes('orgánico')) {
    score += 0.2;
  }
  if (labelText.includes('rainforest') || labelText.includes('rainforest alliance')) {
    score += 0.1;
  }

  // Bonus por origen conocido y trazable
  if (product.openfoodfacts_data?.origins) {
    score += 0.1;
  }

  // Penalización por muchos aditivos (indica procesamiento excesivo)
  const additives = product.openfoodfacts_data?.additives || [];
  if (additives.length > 5) {
    score -= 0.1;
  }

  return Math.max(0, Math.min(1, score));
}

/**
 * Calcula scores para múltiples productos
 */
export function calculateScoresForProducts(products, weights) {
  return products.map(product => ({
    ...product,
    sustainability_score: calculateSustainabilityScore(product, weights)
  }));
}

