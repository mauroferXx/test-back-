/**
 * Lógica de Sustitución Inteligente
 * Sugiere alternativas de mejor Score cuando un producto es añadido
 */

/**
 * Extrae todas las categorías de un producto (de category y openfoodfacts_data)
 * @param {Object} product - Producto del cual extraer categorías
 * @returns {Array} Array de categorías normalizadas
 */
function extractCategories(product) {
  const categories = [];
  
  // Categorías del campo category (separadas por comas)
  if (product.category) {
    categories.push(...product.category.toLowerCase().split(',').map(c => c.trim()));
  }
  
  // Categorías de openfoodfacts_data.categories_tags si existe
  let openfoodfactsData = product.openfoodfacts_data;
  if (typeof openfoodfactsData === 'string') {
    try {
      openfoodfactsData = JSON.parse(openfoodfactsData);
    } catch (e) {
      openfoodfactsData = {};
    }
  }
  
  if (openfoodfactsData && typeof openfoodfactsData === 'object') {
    if (Array.isArray(openfoodfactsData.categories_tags)) {
      categories.push(...openfoodfactsData.categories_tags.map(c => 
        c.toLowerCase().replace(/^en:/, '').replace(/^es:/, '')
      ));
    }
  }
  
  return [...new Set(categories)]; // Eliminar duplicados
}

/**
 * Encuentra sustitutos inteligentes para un producto
 * @param {Object} product - Producto a sustituir
 * @param {Array} availableProducts - Lista de productos disponibles
 * @param {Object} criteria - Criterios de búsqueda
 * @returns {Array} Lista de productos sustitutos ordenados por score
 */
export function findSmartSubstitutes(product, availableProducts, criteria = {}) {
  const {
    minScoreImprovement = 0.1, // Mejora mínima del 10%
    sameCategory = true,
    maxResults = 5,
    maxPriceIncrease = 0.2 // Máximo 20% más caro
  } = criteria;

  const currentScore = product.sustainability_score?.total || 0;
  const currentPrice = product.price || 0;

  // Debug: Log del producto original
  const productCurrency = product.currency || 'EUR';
  const productCurrencySymbol = product.currency_symbol || '€';
  console.log(`[SmartSubstitution] Finding substitutes for "${product.name}"`);
  console.log(`[SmartSubstitution] Original score: ${(currentScore * 100).toFixed(1)}%, price: ${currentPrice.toFixed(2)} ${productCurrency}`);
  
  // Debug: Log de categorías del producto original
  const productCatsDebug = extractCategories(product);
  console.log(`[SmartSubstitution] Original categories: ${productCatsDebug.join(', ')}`);

  // Filtrar productos candidatos
  const rejectionReasons = {};
  
  const candidates = availableProducts.filter(candidate => {
    // No incluir el mismo producto (verificar por ID, barcode Y nombre)
    if (candidate.id === product.id || candidate.barcode === product.barcode) {
      return false;
    }
    
    // También verificar si el nombre es idéntico (case-insensitive)
    const candidateName = (candidate.name || '').toLowerCase().trim();
    const productName = (product.name || '').toLowerCase().trim();
    if (candidateName === productName) {
      return false; // No reemplazar por el mismo producto
    }
    
    let rejectionReason = null;

    // Extraer categorías de la base de datos (tanto de category como de openfoodfacts_data)
    const productCategories = extractCategories(product);
    const candidateCategories = extractCategories(candidate);
    
    // Debug: Log de categorías del candidato (solo para los primeros 3)
    if (availableProducts.indexOf(candidate) < 3) {
      console.log(`[SmartSubstitution] Candidate "${candidateName}" categories: ${candidateCategories.join(', ')}`);
    }

    // Lista de categorías genéricas que no son útiles para comparación
    const genericCategories = [
      'alimentos y bebidas de origen vegetal',
      'alimentos de origen vegetal',
      'alimentos',
      'bebidas',
      'desayunos',
      'specific products',
      'products for specific diets',
      'en:specific products',
      'en:products for specific diets'
    ];
    
    // NOTA: No excluir "lácteos" y "dairies" porque pueden ser útiles para comparación
    // cuando otros productos solo tienen categorías genéricas

    // Filtrar categorías significativas (no genéricas, pero incluir lácteos/dairies)
    const productSignificantCats = productCategories.filter(cat =>
      !genericCategories.some(gen => cat.includes(gen)) && cat.length > 3
    );
    const candidateSignificantCats = candidateCategories.filter(cat =>
      !genericCategories.some(gen => cat.includes(gen)) && cat.length > 3
    );
    
    // También extraer palabras clave de categorías (ej: "leche", "milk") para comparación flexible
    const extractKeywords = (cats) => {
      const keywords = new Set();
      cats.forEach(cat => {
        // Extraer palabras individuales de las categorías
        const words = cat.split(/[\s,-]+/).filter(w => w.length > 3);
        words.forEach(w => keywords.add(w.toLowerCase()));
      });
      return Array.from(keywords);
    };
    
    const productKeywords = extractKeywords(productCategories);
    const candidateKeywords = extractKeywords(candidateCategories);

    // Misma categoría si se requiere (comparación inteligente y muy flexible)
    if (sameCategory) {
      // Verificar si comparten categorías en cualquier nivel
      const allProductCats = productCategories.filter(cat => cat.length > 2);
      const allCandidateCats = candidateCategories.filter(cat => cat.length > 2);
      
      // Verificar coincidencias en múltiples niveles
      const hasBasicMatch = allProductCats.length > 0 && allCandidateCats.length > 0 &&
        allProductCats.some(cat =>
          allCandidateCats.some(candCat =>
            candCat.includes(cat) || cat.includes(candCat)
          )
        );
      
      const hasKeywordMatch = productKeywords.length > 0 && candidateKeywords.length > 0 &&
        productKeywords.some(kw =>
          candidateKeywords.some(candKw =>
            candKw.includes(kw) || kw.includes(candKw)
          )
        );
      
      const hasSignificantMatch = productSignificantCats.length > 0 && candidateSignificantCats.length > 0 &&
        productSignificantCats.some(cat =>
          candidateSignificantCats.some(candCat =>
            candCat.includes(cat) || cat.includes(candCat)
          )
        );
      
      // Verificar si el nombre tiene palabras clave compartidas
      const productNameWords = (product.name || '').toLowerCase().split(/\s+/).filter(w => w.length > 3);
      const candidateNameWords = (candidate.name || '').toLowerCase().split(/\s+/).filter(w => w.length > 3);
      const hasNameMatch = productNameWords.length > 0 && candidateNameWords.length > 0 &&
        productNameWords.some(w => candidateNameWords.includes(w));
      
      // Verificar palabras clave comunes en nombres (muy flexible)
      const productHasLeche = (product.name || '').toLowerCase().includes('leche') || 
                              (product.name || '').toLowerCase().includes('milk');
      const candidateHasLeche = (candidate.name || '').toLowerCase().includes('leche') || 
                                (candidate.name || '').toLowerCase().includes('milk');
      
      // Si no hay coincidencias en ningún nivel, rechazar solo si no comparten palabras clave en el nombre
      if (!hasBasicMatch && !hasKeywordMatch && !hasSignificantMatch && !hasNameMatch && 
          !(productHasLeche && candidateHasLeche)) {
        rejectionReason = 'no_category_match';
        rejectionReasons[candidateName] = rejectionReason;
        return false;
      }
    }

    // VALIDACIÓN DE INCOMPATIBILIDADES BASADA EN CATEGORÍAS DE LA BASE DE DATOS
    // Definir grupos de categorías incompatibles basados en datos reales
    const incompatibleCategoryGroups = [
      // Grupo de leches (no compatible con cremas, quesos, mantequillas)
      {
        categories: ['leche', 'leches', 'milk', 'milks', 'leche semidesnatada', 'leche semidescremada', 
                     'leche entera', 'leche desnatada', 'leche descremada', 'whole-milks', 'semi-skimmed milk',
                     'skimmed milk', 'leche-uht', 'leche-de-vaca', 'leche sin lactosa'],
        incompatibleWith: ['nata', 'crema', 'cream', 'queso', 'cheese', 'mantequilla', 'butter', 
                           'dairy-spread', 'grasas de la leche', 'grasas animales']
      },
      // Grupo de cremas (no compatible con leches, quesos, mantequillas)
      {
        categories: ['nata', 'crema', 'cream'],
        incompatibleWith: ['leche', 'leches', 'milk', 'milks', 'queso', 'cheese', 'mantequilla', 'butter']
      },
      // Grupo de quesos (no compatible con leches, cremas, mantequillas)
      {
        categories: ['queso', 'cheese', 'queso rallado'],
        incompatibleWith: ['leche', 'leches', 'milk', 'nata', 'crema', 'mantequilla', 'butter']
      },
      // Grupo de mantequillas (no compatible con leches, cremas, quesos)
      {
        categories: ['mantequilla', 'butter', 'dairy-spread', 'grasas de la leche'],
        incompatibleWith: ['leche', 'leches', 'milk', 'nata', 'crema', 'queso', 'cheese']
      }
    ];

    // Verificar incompatibilidades basadas en categorías
    for (const group of incompatibleCategoryGroups) {
      const productHasGroupCategory = group.categories.some(cat =>
        productSignificantCats.some(pCat => pCat.includes(cat) || cat.includes(pCat))
      );
      const candidateHasIncompatible = group.incompatibleWith.some(incat =>
        candidateSignificantCats.some(cCat => cCat.includes(incat) || incat.includes(cCat))
      );
      
      if (productHasGroupCategory && candidateHasIncompatible) {
        // Productos incompatibles basados en categorías: rechazar
        rejectionReason = 'incompatible_categories';
        return false;
      }
    }

    // Bonus por categorías compartidas (especialmente las más específicas)
    let categoryBonus = 0;
    if (productSignificantCats.length > 0 && candidateSignificantCats.length > 0) {
      const sharedSignificantCats = productSignificantCats.filter(cat =>
        candidateSignificantCats.some(candCat =>
          candCat.includes(cat) || cat.includes(candCat)
        )
      );
      
      if (sharedSignificantCats.length > 0) {
        // Bonus proporcional al número de categorías compartidas
        categoryBonus = Math.min(0.15, sharedSignificantCats.length * 0.05);
        
        // Bonus adicional si comparten la categoría más específica
        const productMostSpecific = productSignificantCats[productSignificantCats.length - 1];
        const candidateMostSpecific = candidateSignificantCats[candidateSignificantCats.length - 1];
        if (productMostSpecific.includes(candidateMostSpecific) || 
            candidateMostSpecific.includes(productMostSpecific)) {
          categoryBonus += 0.1;
        }
      }
    }

    // Verificar si comparten categorías (para aplicar lógica más flexible)
    // Incluir comparación por palabras clave también
    const hasSharedCategories = (productSignificantCats.length > 0 && candidateSignificantCats.length > 0 &&
      productSignificantCats.some(cat =>
        candidateSignificantCats.some(candCat =>
          candCat.includes(cat) || cat.includes(candCat)
        )
      )) || (productCategories.length > 0 && candidateCategories.length > 0 &&
      productCategories.some(cat =>
        candidateCategories.some(candCat =>
          candCat.includes(cat) || cat.includes(candCat)
        )
      )) || (productKeywords.length > 0 && candidateKeywords.length > 0 &&
      productKeywords.some(kw =>
        candidateKeywords.some(candKw =>
          candKw.includes(kw) || kw.includes(candKw)
        )
      ));

    // Debe tener mejor score (con bonus por categorías compartidas)
    const candidateScore = candidate.sustainability_score?.total || 0;
    const adjustedCandidateScore = candidateScore + categoryBonus;
    
    // Si comparte categorías, ser más flexible con el requerimiento de mejora
    let adjustedMinImprovement = minScoreImprovement;
    if (hasSharedCategories) {
      // Si comparte categorías, reducir significativamente el requerimiento
      adjustedMinImprovement = minScoreImprovement * 0.2; // Solo 20% del requerimiento original
    } else if (categoryBonus > 0) {
      // Si hay bonus pero no comparte categorías exactas, reducir moderadamente
      adjustedMinImprovement = minScoreImprovement * 0.5;
    }
    
    const requiredScore = currentScore + adjustedMinImprovement;
    
    // Si comparte categorías, permitir score igual o ligeramente mejor (más flexible)
    if (hasSharedCategories) {
      // Si comparte categorías, solo requiere que el score no sea significativamente peor
      // Permitir si es igual o mejor, o solo ligeramente peor (hasta 5% peor - más flexible)
      if (adjustedCandidateScore < currentScore - 0.05) {
        rejectionReason = `score_too_low_shared`;
        rejectionReasons[candidateName] = rejectionReason;
        return false; // Rechazar solo si es más de 5% peor
      }
    } else {
      // Si no comparte categorías pero tiene categorías similares, ser más flexible
      const hasSimilarCategories = productCategories.length > 0 && candidateCategories.length > 0 &&
        (productCategories.some(cat => candidateCategories.some(candCat => 
          candCat.toLowerCase().includes(cat.toLowerCase().substring(0, 4)) || 
          cat.toLowerCase().includes(candCat.toLowerCase().substring(0, 4))
        )));
      
      if (hasSimilarCategories) {
        // Si tiene categorías similares, permitir hasta 3% peor
        if (adjustedCandidateScore < currentScore - 0.03) {
          rejectionReason = `score_too_low`;
          rejectionReasons[candidateName] = rejectionReason;
          return false;
        }
      } else {
        // Si no comparte categorías, requiere mejora mínima
        if (adjustedCandidateScore <= requiredScore) {
          rejectionReason = `score_too_low`;
          rejectionReasons[candidateName] = rejectionReason;
          return false;
        }
      }
    }

    // Precio no debe exceder el límite
    // IMPORTANTE: Ambos precios deben estar en la misma moneda
    // (ya fueron convertidos en findSubstitutesForProduct)
    const candidatePrice = candidate.price || 0;
    const candidateCurrency = candidate.currency || productCurrency;
    
    // Solo comparar si están en la misma moneda
    if (candidateCurrency === productCurrency) {
      if (candidatePrice > currentPrice * (1 + maxPriceIncrease)) {
        rejectionReason = `price_too_high`;
        rejectionReasons[candidateName] = rejectionReason;
        return false;
      }
    } else {
      // Si las monedas no coinciden, es un error de configuración
      console.warn(`[SmartSubstitution] Currency mismatch: product=${productCurrency}, candidate=${candidateCurrency} for "${candidateName}"`);
    }

    // Filtros dietéticos (Personalización)
    if (criteria.dietaryRestrictions) {
      const { vegan, glutenFree } = criteria.dietaryRestrictions;
      const labels = (candidate.openfoodfacts_data?.labels_tags || []).join(' ').toLowerCase();
      const ingredients = (candidate.openfoodfacts_data?.ingredients_text || '').toLowerCase();
      const categories = (candidate.category || '').toLowerCase();

      if (vegan) {
        // Verificar si es vegano (etiqueta o ausencia de ingredientes animales comunes)
        const isVeganLabel = labels.includes('vegan');
        const hasAnimalIngredients = ingredients.includes('leche') || ingredients.includes('huevo') || ingredients.includes('miel') || ingredients.includes('carne');
        if (!isVeganLabel && hasAnimalIngredients) {
          rejectionReason = 'not_vegan';
          return false;
        }
      }

      if (glutenFree) {
        // Verificar si es sin gluten
        const isGlutenFreeLabel = labels.includes('gluten-free') || labels.includes('sin gluten');
        const hasGluten = ingredients.includes('trigo') || ingredients.includes('cebada') || ingredients.includes('centeno');
        if (!isGlutenFreeLabel && hasGluten) {
          rejectionReason = 'has_gluten';
          return false;
        }
      }
    }
    
    // Si llegamos aquí, el candidato pasó todos los filtros
    return true;
  });
  
  // Debug: Log de resultados
  console.log(`[SmartSubstitution] Filtered ${candidates.length} valid candidates from ${availableProducts.length} total`);
  if (candidates.length === 0 && availableProducts.length > 0) {
    const reasonCounts = {};
    Object.values(rejectionReasons).forEach(reason => {
      if (reason) {
        const baseReason = reason.split('(')[0].trim();
        reasonCounts[baseReason] = (reasonCounts[baseReason] || 0) + 1;
      }
    });
    const topReasons = Object.entries(reasonCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([reason, count]) => `${reason}: ${count}`)
      .join(', ');
    if (topReasons) {
      console.log(`[SmartSubstitution] All candidates were rejected. Top rejection reasons: ${topReasons}`);
    }
  }

  // Preparar candidatos con información de scores
  const candidatesWithScores = candidates.map(candidate => {
    const candidateBreakdown = candidate.sustainability_score?.breakdown || {};
    const productBreakdown = product.sustainability_score?.breakdown || {};
    
    // Calcular mejoras en cada dimensión
    const economicImprovement = (candidateBreakdown.economic || 0) - (productBreakdown.economic || 0);
    const environmentalImprovement = (candidateBreakdown.environmental || 0) - (productBreakdown.environmental || 0);
    const socialImprovement = (candidateBreakdown.social || 0) - (productBreakdown.social || 0);
    
    const priceDifference = candidate.price - currentPrice;
    
    return {
      ...candidate,
      economicImprovement,
      environmentalImprovement,
      socialImprovement,
      priceDifference,
      // Scores individuales para comparación
      economicScore: candidateBreakdown.economic || 0,
      environmentalScore: candidateBreakdown.environmental || 0,
      socialScore: candidateBreakdown.social || 0
    };
  });

  // Encontrar el mejor en cada dimensión (ser más flexible si hay pocos candidatos)
  const productEconomic = product.sustainability_score?.breakdown?.economic || 0;
  const productEnvironmental = product.sustainability_score?.breakdown?.environmental || 0;
  const productSocial = product.sustainability_score?.breakdown?.social || 0;

  // Si solo hay 1 candidato, usarlo para las 3 opciones pero destacar diferentes aspectos
  if (candidatesWithScores.length === 1) {
    const singleCandidate = candidatesWithScores[0];
    const result = [];
    
    // Determinar qué dimensión es la mejor de este candidato
    const economicIsBest = singleCandidate.economicScore >= singleCandidate.environmentalScore && 
                          singleCandidate.economicScore >= singleCandidate.socialScore;
    const environmentalIsBest = singleCandidate.environmentalScore >= singleCandidate.economicScore && 
                                 singleCandidate.environmentalScore >= singleCandidate.socialScore;
    const socialIsBest = singleCandidate.socialScore >= singleCandidate.economicScore && 
                        singleCandidate.socialScore >= singleCandidate.environmentalScore;
    
    // Agregar el candidato con la etiqueta de su mejor dimensión
    if (economicIsBest) {
      result.push({
        ...singleCandidate,
        recommendationType: 'economic',
        recommendationLabel: 'Mejor Opción Económica'
      });
    } else if (environmentalIsBest) {
      result.push({
        ...singleCandidate,
        recommendationType: 'environmental',
        recommendationLabel: 'Mejor Opción Ambiental'
      });
    } else {
      result.push({
        ...singleCandidate,
        recommendationType: 'social',
        recommendationLabel: 'Mejor Opción Social'
      });
    }
    
    return result;
  }

  // Si hay múltiples candidatos, encontrar el mejor en cada dimensión
  // Pero solo considerar candidatos que mejoren o igualen el score total (o sean muy cercanos)
  const validCandidates = candidatesWithScores.filter(c => {
    const candidateTotal = c.sustainability_score?.total || 0;
    // Permitir si mejora el score total, o si está dentro del 5% del score original
    return candidateTotal >= currentScore - 0.05;
  });
  
  // Si no hay suficientes candidatos válidos, usar todos pero priorizar los que mejoran
  const candidatesToUse = validCandidates.length >= 3 ? validCandidates : candidatesWithScores;
  
  // Mejor económico: priorizar mejor score económico o mejor precio
  const bestEconomic = candidatesToUse
    .sort((a, b) => {
      // Priorizar candidatos que mejoran el score total
      const aTotal = a.sustainability_score?.total || 0;
      const bTotal = b.sustainability_score?.total || 0;
      const aImprovesTotal = aTotal >= currentScore;
      const bImprovesTotal = bTotal >= currentScore;
      
      if (aImprovesTotal && !bImprovesTotal) return -1;
      if (!aImprovesTotal && bImprovesTotal) return 1;
      
      // Si ambos mejoran o ninguno mejora, priorizar mejor score económico
      const aImproves = a.economicScore >= productEconomic || a.priceDifference < 0;
      const bImproves = b.economicScore >= productEconomic || b.priceDifference < 0;
      
      if (aImproves && bImproves) {
        if (Math.abs(a.economicScore - b.economicScore) < 0.05) {
          return a.priceDifference - b.priceDifference; // Más barato primero
        }
        return b.economicScore - a.economicScore;
      }
      if (aImproves && !bImproves) return -1;
      if (!aImproves && bImproves) return 1;
      // Si ninguno mejora económicamente, priorizar mejor score económico de todos modos
      if (Math.abs(a.economicScore - b.economicScore) < 0.05) {
        return a.priceDifference - b.priceDifference;
      }
      return b.economicScore - a.economicScore;
    })[0];

  // Mejor ambiental: priorizar mejor score ambiental
  const bestEnvironmental = candidatesToUse
    .sort((a, b) => {
      // Priorizar candidatos que mejoran el score total
      const aTotal = a.sustainability_score?.total || 0;
      const bTotal = b.sustainability_score?.total || 0;
      const aImprovesTotal = aTotal >= currentScore;
      const bImprovesTotal = bTotal >= currentScore;
      
      if (aImprovesTotal && !bImprovesTotal) return -1;
      if (!aImprovesTotal && bImprovesTotal) return 1;
      
      // Si ambos mejoran o ninguno mejora, priorizar mejor score ambiental
      const aImproves = a.environmentalScore >= productEnvironmental;
      const bImproves = b.environmentalScore >= productEnvironmental;
      
      if (aImproves && bImproves) {
        if (Math.abs(a.environmentalScore - b.environmentalScore) < 0.05) {
          return a.priceDifference - b.priceDifference;
        }
        return b.environmentalScore - a.environmentalScore;
      }
      if (aImproves && !bImproves) return -1;
      if (!aImproves && bImproves) return 1;
      // Si ninguno mejora ambientalmente, priorizar mejor score ambiental de todos modos
      if (Math.abs(a.environmentalScore - b.environmentalScore) < 0.05) {
        return a.priceDifference - b.priceDifference;
      }
      return b.environmentalScore - a.environmentalScore;
    })[0];

  // Mejor social: priorizar mejor score social
  const bestSocial = candidatesToUse
    .sort((a, b) => {
      // Priorizar candidatos que mejoran el score total
      const aTotal = a.sustainability_score?.total || 0;
      const bTotal = b.sustainability_score?.total || 0;
      const aImprovesTotal = aTotal >= currentScore;
      const bImprovesTotal = bTotal >= currentScore;
      
      if (aImprovesTotal && !bImprovesTotal) return -1;
      if (!aImprovesTotal && bImprovesTotal) return 1;
      
      // Si ambos mejoran o ninguno mejora, priorizar mejor score social
      const aImproves = a.socialScore >= productSocial;
      const bImproves = b.socialScore >= productSocial;
      
      if (aImproves && bImproves) {
        if (Math.abs(a.socialScore - b.socialScore) < 0.05) {
          return a.priceDifference - b.priceDifference;
        }
        return b.socialScore - a.socialScore;
      }
      if (aImproves && !bImproves) return -1;
      if (!aImproves && bImproves) return 1;
      // Si ninguno mejora socialmente, priorizar mejor score social de todos modos
      if (Math.abs(a.socialScore - b.socialScore) < 0.05) {
        return a.priceDifference - b.priceDifference;
      }
      return b.socialScore - a.socialScore;
    })[0];

  // Construir array de resultados (eliminar duplicados)
  const result = [];
  const addedIds = new Set();
  
  // Agregar mejor económico
  if (bestEconomic && !addedIds.has(bestEconomic.id)) {
    result.push({
      ...bestEconomic,
      recommendationType: 'economic',
      recommendationLabel: 'Mejor Opción Económica'
    });
    addedIds.add(bestEconomic.id);
  }
  
  // Agregar mejor ambiental
  if (bestEnvironmental && !addedIds.has(bestEnvironmental.id)) {
    result.push({
      ...bestEnvironmental,
      recommendationType: 'environmental',
      recommendationLabel: 'Mejor Opción Ambiental'
    });
    addedIds.add(bestEnvironmental.id);
  }
  
  // Agregar mejor social
  if (bestSocial && !addedIds.has(bestSocial.id)) {
    result.push({
      ...bestSocial,
      recommendationType: 'social',
      recommendationLabel: 'Mejor Opción Social'
    });
    addedIds.add(bestSocial.id);
  }
  
  // Si no hay suficientes resultados (menos de 3), agregar los mejores por score total
  // Pero solo si mejoran o igualan el score original
  if (result.length < maxResults) {
    const sortedByTotal = candidatesWithScores
      .filter(c => {
        // Solo incluir si no está ya agregado Y mejora o iguala el score total
        if (addedIds.has(c.id)) return false;
        const candidateTotal = c.sustainability_score?.total || 0;
        return candidateTotal >= currentScore - 0.02; // Permitir hasta 2% peor para "balanceada"
      })
      .sort((a, b) => {
        const aTotal = a.sustainability_score?.total || 0;
        const bTotal = b.sustainability_score?.total || 0;
        // Priorizar los que mejoran el score total
        if (aTotal >= currentScore && bTotal < currentScore) return -1;
        if (aTotal < currentScore && bTotal >= currentScore) return 1;
        return bTotal - aTotal;
      });
    
    for (const candidate of sortedByTotal.slice(0, maxResults - result.length)) {
      result.push({
        ...candidate,
        recommendationType: 'balanced',
        recommendationLabel: 'Mejor Opción Balanceada'
      });
      addedIds.add(candidate.id);
    }
  }

  return result;
}

/**
 * Sugiere sustitutos para múltiples productos en una lista
 */
export function suggestSubstitutesForList(products, availableProducts, criteria) {
  return products.map(product => ({
    original: product,
    substitutes: findSmartSubstitutes(product, availableProducts, criteria)
  }));
}

/**
 * Encuentra el mejor sustituto considerando múltiples factores
 */
export function findBestSubstitute(product, availableProducts, weights = {}) {
  const {
    scoreWeight = 0.5,
    priceWeight = 0.3,
    carbonWeight = 0.2
  } = weights;

  const substitutes = findSmartSubstitutes(product, availableProducts, {
    minScoreImprovement: 0.05, // Más flexible
    sameCategory: false, // Permitir otras categorías
    maxResults: 10
  });

  if (substitutes.length === 0) {
    return null;
  }

  // Calcular score compuesto para cada sustituto
  const scoredSubstitutes = substitutes.map(substitute => {
    const scoreImprovement = substitute.sustainability_score.total - (product.sustainability_score?.total || 0);
    const priceRatio = product.price > 0 ? substitute.price / product.price : 1;
    const carbonImprovement = (parseFloat(product.carbon_footprint || 0) - parseFloat(substitute.carbon_footprint || 0)) / Math.max(parseFloat(product.carbon_footprint || 1), 1);

    // Normalizar valores
    const normalizedScore = Math.min(scoreImprovement / 0.5, 1); // Asumiendo mejora máxima de 0.5
    const normalizedPrice = 1 / priceRatio; // Invertir para que menor precio = mejor
    const normalizedCarbon = Math.max(0, Math.min(1, carbonImprovement + 0.5)); // Centrar en 0.5

    const compositeScore = (
      normalizedScore * scoreWeight +
      normalizedPrice * priceWeight +
      normalizedCarbon * carbonWeight
    );

    return {
      ...substitute,
      compositeScore
    };
  }).sort((a, b) => b.compositeScore - a.compositeScore);

  return scoredSubstitutes[0] || null;
}

