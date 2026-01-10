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
 * Get positions reserved for properties ONLY (no separators allowed)
 * - Airport adjacents: must be properties
 * - Corner adjacents: must be properties
 */
const getPropertyReservedPositions = (positions: ReturnType<typeof getBoardPositions>, tileCount: number): Set<number> => {
  const reserved = new Set<number>();
  
  // Airport adjacent - must be properties
  positions.airportPositions.forEach(airportPos => {
    if (airportPos - 1 >= 0) reserved.add(airportPos - 1);
    if (airportPos + 1 < tileCount) reserved.add(airportPos + 1);
  });
  
  // Corner adjacent - must be properties
  const corners = [positions.goPosition, positions.jailPosition, positions.freeParkingPosition, positions.goToJailPosition];
  corners.forEach(corner => {
    const after = (corner + 1) % tileCount;
    reserved.add(after);
    const before = (corner - 1 + tileCount) % tileCount;
    reserved.add(before);
  });
  
  return reserved;
};

/**
 * Generates a complete board from a custom configuration
 * 
 * Rules:
 * - Corners and airports are fixed
 * - Positions adjacent to airports AND corners must be properties
 * - Companies: used exactly once (2 for 40-tile, 3 for 48-tile)
 * - Income Tax and Luxury Tax: used exactly once each
 * - Chance and Community Chest: can repeat
 */
export const createCustomBoard = (config: CustomBoardConfig): Tile[] => {
  const tiles: (Tile | null)[] = new Array(config.tileCount).fill(null);
  const positions = getBoardPositions(config.tileCount);
  const reservedForProperties = getPropertyReservedPositions(positions, config.tileCount);
  
  // ============================================
  // UNIQUE TILES (each used exactly once)
  // ============================================
  
  // Companies (2 for 40-tile, 3 for 48-tile)
  const maxCompanies = config.tileCount === 40 ? 2 : 3;
  const uniqueTiles: Tile[] = (config.companies || []).slice(0, maxCompanies).map((company, i) => ({
    id: `utility_${i}`,
    name: company.name,
    type: 'UTILITY',
    price: company.price,
    rent: [4, 10],
    houses: 0,
    isMortgaged: false,
    icon: company.icon
  }));
  
  // Tax tiles (each used once)
  uniqueTiles.push(
    { id: 'tax_income', name: 'Income Tax', type: 'TAX', price: 200, houses: 0, isMortgaged: false, icon: '💸' },
    { id: 'tax_luxury', name: 'Luxury Tax', type: 'TAX', price: 100, houses: 0, isMortgaged: false, icon: '💎' }
  );
  
  let uniqueIndex = 0;
  
  // ============================================
  // REPEATABLE TILES (Chance and Community Chest)
  // ============================================
  const repeatablePool: Tile[] = [
    { id: 'chance_1', name: 'Chance', type: 'CHANCE', houses: 0, isMortgaged: false, icon: '❓' },
    { id: 'chest_1', name: 'Community Chest', type: 'COMMUNITY_CHEST', houses: 0, isMortgaged: false, icon: '📦' },
    { id: 'chance_2', name: 'Chance', type: 'CHANCE', houses: 0, isMortgaged: false, icon: '❓' },
    { id: 'chest_2', name: 'Community Chest', type: 'COMMUNITY_CHEST', houses: 0, isMortgaged: false, icon: '📦' }
  ];
  let repeatableIndex = 0;
  
  /**
   * Get next separator tile
   */
  const getNextSeparator = (): Tile => {
    // First use unique tiles (companies and taxes)
    if (uniqueIndex < uniqueTiles.length) {
      const tile = uniqueTiles[uniqueIndex];
      uniqueIndex++;
      return tile;
    }
    // Then cycle through repeatable tiles
    const tile = repeatablePool[repeatableIndex % repeatablePool.length];
    repeatableIndex++;
    return { ...tile, id: `${tile.type.toLowerCase()}_${repeatableIndex}` };
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
      
      // Add separator between countries (only if NOT in reserved positions)
      if (countriesOnThisSide > 0 && pos !== side.air && !reservedForProperties.has(pos)) {
        tiles[pos] = getNextSeparator();
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
        
        // Internal separator for city distribution (only if NOT in reserved positions)
        const needsInternalSeparator = 
          (country.cities.length === 2 && cityIdx === 0) ||
          (country.cities.length >= 3 && cityIdx === 1);
        
        if (needsInternalSeparator && cityIdx < country.cities.length - 1) {
          if (pos <= side.end && pos !== side.air && !reservedForProperties.has(pos)) {
            tiles[pos] = getNextSeparator();
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
      tiles[i] = getNextSeparator();
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
