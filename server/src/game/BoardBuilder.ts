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
 * Side of the board (each side has tilesPerSide tiles including one corner)
 */
type BoardSide = 'bottom' | 'left' | 'top' | 'right';

/**
 * A segment representing a country or separator on a side
 */
interface SideSegment {
  type: 'country' | 'separator';
  country?: CustomCountry;
  separatorType?: 'CHANCE' | 'COMMUNITY_CHEST' | 'TAX' | 'UTILITY';
}

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
 * Distributes countries across 4 sides with separators between them.
 * Rules:
 * - Min 2, Max 3 countries per side
 * - No country can wrap from one side to another
 * - Countries must be separated by at least one separator tile
 */
const distributeCountriesToSides = (countries: CustomCountry[], tilesPerSide: number): Map<BoardSide, CustomCountry[]> => {
  const sides: BoardSide[] = ['bottom', 'left', 'top', 'right'];
  const result = new Map<BoardSide, CustomCountry[]>();
  sides.forEach(side => result.set(side, []));

  // Sort countries by rank (cheapest first)
  const sortedCountries = [...countries].sort((a, b) => a.rank - b.rank);
  
  // Calculate total cities
  const totalCities = sortedCountries.reduce((sum, c) => sum + c.cities.length, 0);
  
  // Available slots per side (excluding corner at start, airport at center)
  // For 40-tile: 9 tiles per side - 1 corner - 1 airport = 7 property slots
  // For 48-tile: 11 tiles per side - 1 corner - 1 airport = 9 property slots
  const slotsPerSide = tilesPerSide - 2; // -1 for corner (counted in next side), -1 for airport
  
  // Distribute countries evenly across sides
  let currentSideIndex = 0;
  let currentSideCountries: CustomCountry[] = [];
  let currentSideCities = 0;
  
  for (const country of sortedCountries) {
    const countryCities = country.cities.length;
    const separatorNeeded = currentSideCountries.length > 0 ? 1 : 0; // Need separator between countries
    const spaceNeeded = countryCities + separatorNeeded;
    
    // Check if this country fits on current side
    // Rule: max 3 countries per side, and must fit within slots
    if (currentSideCountries.length >= 3 || currentSideCities + spaceNeeded > slotsPerSide) {
      // Save current side and move to next
      result.set(sides[currentSideIndex], [...currentSideCountries]);
      currentSideIndex = (currentSideIndex + 1) % 4;
      currentSideCountries = [];
      currentSideCities = 0;
    }
    
    currentSideCountries.push(country);
    currentSideCities += countryCities;
    // Add space for separator between countries (within same side)
    if (currentSideCountries.length > 1) {
      currentSideCities += 1;
    }
  }
  
  // Save final side
  if (currentSideCountries.length > 0) {
    result.set(sides[currentSideIndex], currentSideCountries);
  }
  
  return result;
};

/**
 * Places cities for a country with proper gaps
 * Rules:
 * - 2 cities: must be separated by 1 tile
 * - 3-4 cities: max 2 adjacent, then separator
 */
const placeCitiesWithGaps = (
  country: CustomCountry,
  startPos: number,
  tiles: Tile[],
  getSeparatorTile: () => Tile
): number => {
  const basePrice = BASE_COUNTRY_PRICES[country.rank] || 100;
  let currentPos = startPos;
  
  for (let i = 0; i < country.cities.length; i++) {
    const city = country.cities[i];
    const price = Math.round(basePrice * city.priceMultiplier);
    const rent = calculateRent(price);
    const houseCost = calculateHouseCost(price);
    
    tiles[currentPos] = {
      id: `prop_${country.id}_${i}`,
      name: city.name,
      type: 'PROPERTY',
      price,
      rent,
      group: country.id.toUpperCase(),
      houses: 0,
      houseCost,
      isMortgaged: false,
      icon: country.flagEmoji
    };
    currentPos++;
    
    // Add separator between cities based on rules
    const needsSeparator = 
      (country.cities.length === 2 && i === 0) || // 2 cities: separator after first
      (country.cities.length >= 3 && i === 1); // 3-4 cities: separator after 2nd
    
    if (needsSeparator && i < country.cities.length - 1) {
      tiles[currentPos] = getSeparatorTile();
      currentPos++;
    }
  }
  
  return currentPos;
};

/**
 * Generates a complete board from a custom configuration
 * New algorithm:
 * 1. Place corners (fixed)
 * 2. Place airports (center of each side)
 * 3. Distribute countries to sides (min 2, max 3 per side)
 * 4. Place countries' cities with proper gaps
 * 5. Fill remaining gaps with separators (Chance, Community Chest, Tax, Utilities)
 */
export const createCustomBoard = (config: CustomBoardConfig): Tile[] => {
  const tiles: Tile[] = new Array(config.tileCount).fill(null);
  const positions = getBoardPositions(config.tileCount);
  const cornerRules = config.cornerRules || DEFAULT_CORNER_RULES;
  
  // Pool of separator tiles to use
  const separatorPool: Tile[] = [];
  let separatorIndex = 0;
  
  // Add companies to separator pool
  (config.companies || []).forEach((company, i) => {
    separatorPool.push({
      id: `utility_${i}`,
      name: company.name,
      type: 'UTILITY',
      price: company.price,
      rent: [4, 10], // Multipliers for 1 and 2 utilities owned
      houses: 0,
      isMortgaged: false,
      icon: company.icon
    });
  });
  
  // Add Chance, Community Chest, and Tax tiles
  separatorPool.push(
    { id: 'chance_1', name: 'Chance', type: 'CHANCE', houses: 0, isMortgaged: false, icon: '❓' },
    { id: 'chance_2', name: 'Chance', type: 'CHANCE', houses: 0, isMortgaged: false, icon: '❓' },
    { id: 'chest_1', name: 'Community Chest', type: 'COMMUNITY_CHEST', houses: 0, isMortgaged: false, icon: '📦' },
    { id: 'chest_2', name: 'Community Chest', type: 'COMMUNITY_CHEST', houses: 0, isMortgaged: false, icon: '📦' },
    { id: 'tax_income', name: 'Income Tax', type: 'TAX', price: 200, houses: 0, isMortgaged: false, icon: '💸' },
    { id: 'tax_luxury', name: 'Luxury Tax', type: 'TAX', price: 100, houses: 0, isMortgaged: false, icon: '💎' }
  );
  
  const getNextSeparator = (): Tile => {
    const tile = separatorPool[separatorIndex % separatorPool.length];
    separatorIndex++;
    return { ...tile, id: `${tile.id}_${separatorIndex}` };
  };
  
  // 1. Place corner tiles (fixed positions)
  tiles[positions.goPosition] = {
    id: 'go',
    name: 'GO',
    type: 'GO',
    houses: 0,
    isMortgaged: false,
    icon: '🎯'
  };
  
  tiles[positions.jailPosition] = {
    id: 'jail',
    name: 'Jail',
    type: 'JAIL',
    houses: 0,
    isMortgaged: false,
    icon: '🔒'
  };
  
  tiles[positions.freeParkingPosition] = {
    id: 'free_parking',
    name: 'Free Parking',
    type: 'FREE_PARKING',
    houses: 0,
    isMortgaged: false,
    icon: '🅿️'
  };
  
  tiles[positions.goToJailPosition] = {
    id: 'go_to_jail',
    name: 'Go To Jail',
    type: 'GO_TO_JAIL',
    houses: 0,
    isMortgaged: false,
    icon: '🚔'
  };
  
  // 2. Place airports (center of each side)
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
  
  // 3. Distribute countries to sides
  const countriesBySide = distributeCountriesToSides(config.countries, positions.tilesPerSide);
  
  // 4. Place countries on each side
  const sides: { name: BoardSide; startPos: number; endPos: number; airportPos: number }[] = [
    { 
      name: 'bottom', 
      startPos: 1, // After GO
      endPos: positions.jailPosition - 1, 
      airportPos: positions.airportPositions[0]
    },
    { 
      name: 'left', 
      startPos: positions.jailPosition + 1, 
      endPos: positions.freeParkingPosition - 1, 
      airportPos: positions.airportPositions[1]
    },
    { 
      name: 'top', 
      startPos: positions.freeParkingPosition + 1, 
      endPos: positions.goToJailPosition - 1, 
      airportPos: positions.airportPositions[2]
    },
    { 
      name: 'right', 
      startPos: positions.goToJailPosition + 1, 
      endPos: config.tileCount - 1, 
      airportPos: positions.airportPositions[3]
    }
  ];
  
  for (const side of sides) {
    const sideCountries = countriesBySide.get(side.name) || [];
    let currentPos = side.startPos;
    
    for (let i = 0; i < sideCountries.length; i++) {
      const country = sideCountries[i];
      
      // Skip the airport position if we land on it
      if (currentPos === side.airportPos) {
        currentPos++;
      }
      
      // Add separator between countries on same side
      if (i > 0 && tiles[currentPos] === null) {
        tiles[currentPos] = getNextSeparator();
        currentPos++;
      }
      
      // Skip airport if we're at it
      if (currentPos === side.airportPos) {
        currentPos++;
      }
      
      // Place country's cities with gaps
      for (let j = 0; j < country.cities.length; j++) {
        // Skip airport if we're at it
        if (currentPos === side.airportPos) {
          currentPos++;
        }
        
        if (currentPos > side.endPos) break;
        
        const city = country.cities[j];
        const basePrice = BASE_COUNTRY_PRICES[country.rank] || 100;
        const price = Math.round(basePrice * city.priceMultiplier);
        
        tiles[currentPos] = {
          id: `prop_${country.id}_${j}`,
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
        currentPos++;
        
        // Add separator within country for city distribution rules
        const needsInternalSeparator = 
          (country.cities.length === 2 && j === 0) || // 2 cities: separate them
          (country.cities.length >= 3 && j === 1); // 3-4 cities: separator after 2nd
        
        if (needsInternalSeparator && j < country.cities.length - 1) {
          if (currentPos === side.airportPos) {
            currentPos++;
          }
          if (currentPos <= side.endPos && tiles[currentPos] === null) {
            tiles[currentPos] = getNextSeparator();
            currentPos++;
          }
        }
      }
    }
  }
  
  // 5. Fill remaining empty slots with separators
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i] === null) {
      tiles[i] = getNextSeparator();
    }
  }
  
  return tiles;
};

/**
 * Creates a default custom board configuration template
 */
export const createDefaultCustomBoardConfig = (creatorId: string, tileCount: 40 | 48 = 40): CustomBoardConfig => {
  const now = Date.now();
  
  // Default countries for 40-tile board
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
    specialTiles: [] // Auto-generated by the board builder
  };
};

export { CustomBoardConfig, CornerRules, CustomCompany };
