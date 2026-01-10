import { Tile } from '../types';
import {
  CustomBoardConfig,
  CustomCountry,
  CustomCompany,
  CornerRules,
  getBoardPositions,
  BASE_COUNTRY_PRICES,
  calculateRent,
  calculateHouseCost,
  DEFAULT_CORNER_RULES
} from '../CustomBoardTypes';

/**
 * Validates a custom board configuration
 */
export const validateCustomBoardConfig = (config: CustomBoardConfig): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  if (config.tileCount !== 40 && config.tileCount !== 48) {
    errors.push('Tile count must be 40 or 48');
  }
  
  const expectedCountries = config.tileCount === 40 ? 8 : 10;
  if (config.countries.length !== expectedCountries) {
    errors.push(`Expected ${expectedCountries} countries for ${config.tileCount}-tile board`);
  }
  
  config.countries.forEach((country) => {
    if (country.cities.length < 2 || country.cities.length > 4) {
      errors.push(`Country "${country.name}" must have 2-4 cities`);
    }
  });
  
  const ranks = config.countries.map(c => c.rank);
  if (new Set(ranks).size !== ranks.length) {
    errors.push('Each country must have a unique rank');
  }
  
  if (config.airports.length !== 4) {
    errors.push('Must have exactly 4 airports');
  }
  
  const expectedCompanies = config.tileCount === 40 ? 2 : 3;
  if ((config.companies?.length || 0) !== expectedCompanies) {
    errors.push(`Expected ${expectedCompanies} companies for ${config.tileCount}-tile board`);
  }
  
  return { valid: errors.length === 0, errors };
};

/**
 * Get positions reserved for properties (adjacent to airports and corners)
 * - Airport adjacents: properties to ensure no separators near airports
 * - Corner adjacents: no companies allowed (but other separators OK)
 */
const getReservedPositions = (positions: ReturnType<typeof getBoardPositions>, tileCount: number) => {
  const airportAdjacent = new Set<number>();
  const cornerAdjacent = new Set<number>();
  
  // Airport adjacent - must be properties
  positions.airportPositions.forEach(airportPos => {
    if (airportPos - 1 >= 0) airportAdjacent.add(airportPos - 1);
    if (airportPos + 1 < tileCount) airportAdjacent.add(airportPos + 1);
  });
  
  // Corner adjacent - no companies allowed
  const corners = [positions.goPosition, positions.jailPosition, positions.freeParkingPosition, positions.goToJailPosition];
  corners.forEach(corner => {
    // Position after corner
    const after = (corner + 1) % tileCount;
    cornerAdjacent.add(after);
    // Position before corner
    const before = (corner - 1 + tileCount) % tileCount;
    cornerAdjacent.add(before);
  });
  
  return { airportAdjacent, cornerAdjacent };
};

/**
 * Generates a complete board from a custom configuration
 */
export const createCustomBoard = (config: CustomBoardConfig): Tile[] => {
  const tiles: (Tile | null)[] = new Array(config.tileCount).fill(null);
  const positions = getBoardPositions(config.tileCount);
  const { airportAdjacent, cornerAdjacent } = getReservedPositions(positions, config.tileCount);
  
  // Limit companies to 2/3 based on board size
  const maxCompanies = config.tileCount === 40 ? 2 : 3;
  const companiesToUse = (config.companies || []).slice(0, maxCompanies);
  
  // Create company tiles (each used exactly once)
  const companyTiles: Tile[] = companiesToUse.map((company, i) => ({
    id: `utility_${i}`,
    name: company.name,
    type: 'UTILITY',
    price: company.price,
    rent: [4, 10],
    houses: 0,
    isMortgaged: false,
    icon: company.icon
  }));
  let companyIndex = 0;
  
  // Create repeatable separator pool (no companies - they're placed separately)
  const separatorPool: Tile[] = [
    { id: 'tax_income', name: 'Income Tax', type: 'TAX', price: 200, houses: 0, isMortgaged: false, icon: '💸' },
    { id: 'chance_1', name: 'Chance', type: 'CHANCE', houses: 0, isMortgaged: false, icon: '❓' },
    { id: 'chest_1', name: 'Community Chest', type: 'COMMUNITY_CHEST', houses: 0, isMortgaged: false, icon: '📦' },
    { id: 'chance_2', name: 'Chance', type: 'CHANCE', houses: 0, isMortgaged: false, icon: '❓' },
    { id: 'chest_2', name: 'Community Chest', type: 'COMMUNITY_CHEST', houses: 0, isMortgaged: false, icon: '📦' },
    { id: 'tax_luxury', name: 'Luxury Tax', type: 'TAX', price: 100, houses: 0, isMortgaged: false, icon: '💎' }
  ];
  let separatorIndex = 0;
  
  /**
   * Get next separator, trying to place a company if allowed at this position
   */
  const getNextSeparator = (currentPos: number): Tile => {
    // Try to place a company if we have any left and position is not near corners
    if (companyIndex < companyTiles.length && !cornerAdjacent.has(currentPos)) {
      const company = companyTiles[companyIndex];
      companyIndex++;
      return company;
    }
    // Otherwise use other separators (cycling through them)
    const tile = separatorPool[separatorIndex % separatorPool.length];
    separatorIndex++;
    return { ...tile, id: `${tile.type.toLowerCase()}_${separatorIndex}` };
  };
  
  // ============================================
  // 1. Place corner tiles
  // ============================================
  tiles[positions.goPosition] = {
    id: 'go', name: 'GO', type: 'GO', houses: 0, isMortgaged: false, icon: '🎯'
  };
  tiles[positions.jailPosition] = {
    id: 'jail', name: 'Jail', type: 'JAIL', houses: 0, isMortgaged: false, icon: '🔒'
  };
  tiles[positions.freeParkingPosition] = {
    id: 'free_parking', name: 'Free Parking', type: 'FREE_PARKING', houses: 0, isMortgaged: false, icon: '🅿️'
  };
  tiles[positions.goToJailPosition] = {
    id: 'go_to_jail', name: 'Go To Jail', type: 'GO_TO_JAIL', houses: 0, isMortgaged: false, icon: '🚔'
  };
  
  // ============================================
  // 2. Place airports
  // ============================================
  const airportNames = ['South', 'West', 'North', 'East'];
  positions.airportPositions.forEach((pos, i) => {
    const airport = config.airports[i];
    tiles[pos] = {
      id: `airport_${i}`,
      name: airport.name || `${airportNames[i]} Airport`,
      type: 'RAILROAD',
      price: airport.price || 200,
      rent: [25, 50, 100, 200],
      houses: 0,
      isMortgaged: false,
      icon: '✈️'
    };
  });
  
  // ============================================
  // 3. Distribute and place countries
  // ============================================
  const sortedCountries = [...config.countries].sort((a, b) => a.rank - b.rank);
  
  const sides = [
    { start: 1, end: positions.jailPosition - 1, air: positions.airportPositions[0] },
    { start: positions.jailPosition + 1, end: positions.freeParkingPosition - 1, air: positions.airportPositions[1] },
    { start: positions.freeParkingPosition + 1, end: positions.goToJailPosition - 1, air: positions.airportPositions[2] },
    { start: positions.goToJailPosition + 1, end: config.tileCount - 1, air: positions.airportPositions[3] }
  ];
  
  const countriesPerSide = Math.ceil(sortedCountries.length / 4);
  let countryIndex = 0;
  
  for (const side of sides) {
    let pos = side.start;
    let countriesOnThisSide = 0;
    
    while (countryIndex < sortedCountries.length && countriesOnThisSide < countriesPerSide && pos <= side.end) {
      const country = sortedCountries[countryIndex];
      
      // Add separator between countries (not in reserved positions)
      if (countriesOnThisSide > 0 && pos !== side.air && !airportAdjacent.has(pos)) {
        tiles[pos] = getNextSeparator(pos);
        pos++;
      }
      
      if (pos === side.air) pos++;
      
      // Place cities
      for (let cityIdx = 0; cityIdx < country.cities.length; cityIdx++) {
        if (pos > side.end) break;
        if (pos === side.air) pos++;
        if (pos > side.end) break;
        
        const city = country.cities[cityIdx];
        const basePrice = BASE_COUNTRY_PRICES[country.rank] || 100;
        const price = Math.round(basePrice * city.priceMultiplier);
        
        tiles[pos] = {
          id: `prop_${country.id}_${cityIdx}`,
          name: city.name,
          type: 'PROPERTY',
          price,
          rent: calculateRent(price),
          group: country.id.toUpperCase(),
          houses: 0,
          houseCost: calculateHouseCost(price),
          isMortgaged: false,
          icon: country.flagEmoji
        };
        pos++;
        
        // Internal separator for city distribution (2 cities: separate, 3-4: after 2nd)
        const needsInternalSeparator = 
          (country.cities.length === 2 && cityIdx === 0) ||
          (country.cities.length >= 3 && cityIdx === 1);
        
        if (needsInternalSeparator && cityIdx < country.cities.length - 1) {
          if (pos <= side.end && pos !== side.air && !airportAdjacent.has(pos)) {
            tiles[pos] = getNextSeparator(pos);
            pos++;
          }
        }
      }
      
      countryIndex++;
      countriesOnThisSide++;
    }
  }
  
  // ============================================
  // 4. Fill remaining empty slots
  // ============================================
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i] === null) {
      tiles[i] = getNextSeparator(i);
    }
  }
  
  return tiles as Tile[];
};

/**
 * Creates a default custom board configuration template
 */
export const createDefaultCustomBoardConfig = (creatorId: string, tileCount: 40 | 48 = 40): CustomBoardConfig => {
  const now = Date.now();
  
  const defaultCountries: CustomCountry[] = [
    { id: 'greece', name: 'Greece', flagEmoji: '🇬🇷', cities: [{ name: 'Athens', priceMultiplier: 1.0 }, { name: 'Thessaloniki', priceMultiplier: 1.0 }], rank: 1 },
    { id: 'italy', name: 'Italy', flagEmoji: '🇮🇹', cities: [{ name: 'Rome', priceMultiplier: 1.0 }, { name: 'Milan', priceMultiplier: 1.1 }, { name: 'Venice', priceMultiplier: 1.2 }], rank: 2 },
    { id: 'spain', name: 'Spain', flagEmoji: '🇪🇸', cities: [{ name: 'Madrid', priceMultiplier: 1.0 }, { name: 'Barcelona', priceMultiplier: 1.1 }, { name: 'Seville', priceMultiplier: 1.2 }], rank: 3 },
    { id: 'germany', name: 'Germany', flagEmoji: '🇩🇪', cities: [{ name: 'Berlin', priceMultiplier: 1.0 }, { name: 'Munich', priceMultiplier: 1.1 }, { name: 'Hamburg', priceMultiplier: 1.2 }], rank: 4 },
    { id: 'france', name: 'France', flagEmoji: '🇫🇷', cities: [{ name: 'Paris', priceMultiplier: 1.0 }, { name: 'Lyon', priceMultiplier: 1.1 }, { name: 'Marseille', priceMultiplier: 1.2 }], rank: 5 },
    { id: 'uk', name: 'United Kingdom', flagEmoji: '🇬🇧', cities: [{ name: 'London', priceMultiplier: 1.0 }, { name: 'Manchester', priceMultiplier: 1.1 }, { name: 'Edinburgh', priceMultiplier: 1.2 }], rank: 6 },
    { id: 'japan', name: 'Japan', flagEmoji: '🇯🇵', cities: [{ name: 'Tokyo', priceMultiplier: 1.0 }, { name: 'Osaka', priceMultiplier: 1.1 }, { name: 'Kyoto', priceMultiplier: 1.2 }], rank: 7 },
    { id: 'usa', name: 'USA', flagEmoji: '🇺🇸', cities: [{ name: 'New York', priceMultiplier: 1.0 }, { name: 'Los Angeles', priceMultiplier: 1.5 }], rank: 8 }
  ];
  
  const defaultCompanies = tileCount === 40 
    ? [
        { name: 'Electric Company', icon: '💡', price: 150 },
        { name: 'Water Works', icon: '💧', price: 150 }
      ]
    : [
        { name: 'Electric Company', icon: '💡', price: 150 },
        { name: 'Water Works', icon: '💧', price: 150 },
        { name: 'Gas Company', icon: '⛽', price: 150 }
      ];
  
  return {
    id: `custom_${now}`,
    name: 'My Custom Board',
    createdBy: creatorId,
    createdAt: now,
    tileCount,
    cornerRules: { ...DEFAULT_CORNER_RULES },
    airports: [
      { name: 'South Airport', price: 200 },
      { name: 'West Airport', price: 200 },
      { name: 'North Airport', price: 200 },
      { name: 'East Airport', price: 200 }
    ],
    companies: defaultCompanies,
    countries: defaultCountries,
    specialTiles: []
  };
};

export { CustomBoardConfig, CornerRules, CustomCompany };
