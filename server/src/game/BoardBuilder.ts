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
  
  // Validate tile count
  if (config.tileCount !== 40 && config.tileCount !== 48) {
    errors.push('Tile count must be 40 or 48');
  }
  
  // Validate countries
  const expectedCountries = config.tileCount === 40 ? 8 : 10;
  if (config.countries.length !== expectedCountries) {
    errors.push(`Expected ${expectedCountries} countries for ${config.tileCount}-tile board, got ${config.countries.length}`);
  }
  
  // Validate each country
  config.countries.forEach((country) => {
    if (country.cities.length < 2 || country.cities.length > 4) {
      errors.push(`Country "${country.name}" must have 2-4 cities, has ${country.cities.length}`);
    }
    if (country.rank < 1 || country.rank > expectedCountries) {
      errors.push(`Country "${country.name}" rank must be 1-${expectedCountries}, got ${country.rank}`);
    }
  });
  
  // Check for duplicate ranks
  const ranks = config.countries.map(c => c.rank);
  const uniqueRanks = new Set(ranks);
  if (uniqueRanks.size !== ranks.length) {
    errors.push('Each country must have a unique rank');
  }
  
  // Validate airports
  if (config.airports.length !== 4) {
    errors.push('Must have exactly 4 airports');
  }
  
  // Validate companies
  const expectedCompanies = config.tileCount === 40 ? 2 : 3;
  if ((config.companies?.length || 0) !== expectedCompanies) {
    errors.push(`Expected ${expectedCompanies} companies for ${config.tileCount}-tile board`);
  }
  
  return { valid: errors.length === 0, errors };
};

/**
 * Get positions that are reserved for properties (adjacent to airports)
 */
const getAirportAdjacentPositions = (airportPositions: number[], tileCount: number): Set<number> => {
  const reserved = new Set<number>();
  airportPositions.forEach(airportPos => {
    // Position before airport
    const before = airportPos - 1;
    if (before >= 0) reserved.add(before);
    // Position after airport
    const after = airportPos + 1;
    if (after < tileCount) reserved.add(after);
  });
  return reserved;
};

/**
 * Generates a complete board from a custom configuration
 * 
 * New rules:
 * 1. Corners and airports are fixed
 * 2. Positions adjacent to airports must be property tiles
 * 3. Countries are distributed across sides (min 2, max 3 per side)
 * 4. Cities within a country: 2 cities separated, 3-4 cities max 2 adjacent
 * 5. Countries separated by special tiles (Chance, Chest, Tax, Company)
 * 6. Max 2 companies (40-tile) or 3 companies (48-tile)
 */
export const createCustomBoard = (config: CustomBoardConfig): Tile[] => {
  const tiles: (Tile | null)[] = new Array(config.tileCount).fill(null);
  const positions = getBoardPositions(config.tileCount);
  
  // Get airport-adjacent positions (must be properties)
  const airportAdjacent = getAirportAdjacentPositions(positions.airportPositions, config.tileCount);
  
  // Limit companies to 2/3 based on board size
  const maxCompanies = config.tileCount === 40 ? 2 : 3;
  const companiesToUse = (config.companies || []).slice(0, maxCompanies);
  
  // Create separator pool (companies first, then others)
  const separatorPool: Tile[] = [];
  
  // Add companies (limited)
  companiesToUse.forEach((company, i) => {
    separatorPool.push({
      id: `utility_${i}`,
      name: company.name,
      type: 'UTILITY',
      price: company.price,
      rent: [4, 10],
      houses: 0,
      isMortgaged: false,
      icon: company.icon
    });
  });
  
  // Add other separators
  separatorPool.push(
    { id: 'tax_income', name: 'Income Tax', type: 'TAX', price: 200, houses: 0, isMortgaged: false, icon: '💸' },
    { id: 'chance_1', name: 'Chance', type: 'CHANCE', houses: 0, isMortgaged: false, icon: '❓' },
    { id: 'chest_1', name: 'Community Chest', type: 'COMMUNITY_CHEST', houses: 0, isMortgaged: false, icon: '📦' },
    { id: 'chance_2', name: 'Chance', type: 'CHANCE', houses: 0, isMortgaged: false, icon: '❓' },
    { id: 'chest_2', name: 'Community Chest', type: 'COMMUNITY_CHEST', houses: 0, isMortgaged: false, icon: '📦' },
    { id: 'tax_luxury', name: 'Luxury Tax', type: 'TAX', price: 100, houses: 0, isMortgaged: false, icon: '💎' }
  );
  
  let separatorIndex = 0;
  const getNextSeparator = (): Tile => {
    const tile = separatorPool[separatorIndex % separatorPool.length];
    separatorIndex++;
    return { ...tile, id: `${tile.type.toLowerCase()}_${separatorIndex}` };
  };
  
  // ============================================
  // 1. Place corner tiles (fixed positions)
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
  // 2. Place airports (center of each side)
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
  // 3. Sort countries by rank and distribute
  // ============================================
  const sortedCountries = [...config.countries].sort((a, b) => a.rank - b.rank);
  
  // Define sides with their ranges (excluding corners)
  const sides = [
    { start: 1, end: positions.jailPosition - 1, air: positions.airportPositions[0] },
    { start: positions.jailPosition + 1, end: positions.freeParkingPosition - 1, air: positions.airportPositions[1] },
    { start: positions.freeParkingPosition + 1, end: positions.goToJailPosition - 1, air: positions.airportPositions[2] },
    { start: positions.goToJailPosition + 1, end: config.tileCount - 1, air: positions.airportPositions[3] }
  ];
  
  // Distribute countries: 2 per side for 8 countries
  const countriesPerSide = Math.ceil(sortedCountries.length / 4);
  let countryIndex = 0;
  
  for (const side of sides) {
    let pos = side.start;
    let countriesOnThisSide = 0;
    
    while (countryIndex < sortedCountries.length && countriesOnThisSide < countriesPerSide && pos <= side.end) {
      const country = sortedCountries[countryIndex];
      
      // Add separator between countries (but not before first country on side)
      if (countriesOnThisSide > 0 && pos !== side.air && !airportAdjacent.has(pos)) {
        tiles[pos] = getNextSeparator();
        pos++;
      }
      
      // Skip airport if we're at it
      if (pos === side.air) pos++;
      
      // Place this country's cities
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
        
        // Add separator within country for city distribution rules
        // 2 cities: separate them | 3-4 cities: separator after 2nd
        const needsInternalSeparator = 
          (country.cities.length === 2 && cityIdx === 0) ||
          (country.cities.length >= 3 && cityIdx === 1);
        
        if (needsInternalSeparator && cityIdx < country.cities.length - 1) {
          if (pos <= side.end && pos !== side.air && !airportAdjacent.has(pos)) {
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
  // 4. Fill any remaining empty slots
  // ============================================
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i] === null) {
      // If adjacent to airport, we need a property - but we've already placed all countries
      // So fill with a separator (fallback)
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
