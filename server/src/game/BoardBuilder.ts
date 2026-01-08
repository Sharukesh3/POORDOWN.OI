import { Tile } from '../types';
import {
  CustomBoardConfig,
  CustomCountry,
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
  const positions = getBoardPositions(config.tileCount);
  
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
  config.countries.forEach((country, i) => {
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
  
  // Validate special tile positions
  const fixedPositions = new Set([
    positions.goPosition,
    positions.jailPosition,
    positions.freeParkingPosition,
    positions.goToJailPosition,
    ...positions.airportPositions
  ]);
  
  config.specialTiles.forEach((tile, i) => {
    if (tile.position < 0 || tile.position >= config.tileCount) {
      errors.push(`Special tile ${i} position ${tile.position} is out of bounds`);
    }
    if (fixedPositions.has(tile.position)) {
      errors.push(`Special tile ${i} cannot be placed at fixed position ${tile.position}`);
    }
  });
  
  return { valid: errors.length === 0, errors };
};

/**
 * Generates a complete board from a custom configuration
 */
export const createCustomBoard = (config: CustomBoardConfig): Tile[] => {
  const tiles: Tile[] = new Array(config.tileCount).fill(null);
  const positions = getBoardPositions(config.tileCount);
  const cornerRules = config.cornerRules || DEFAULT_CORNER_RULES;
  
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
  
  // 2. Place airports (fixed positions)
  const airportNames = ['Bottom', 'Left', 'Top', 'Right'];
  positions.airportPositions.forEach((pos, i) => {
    const airport = config.airports[i];
    tiles[pos] = {
      id: `airport_${i}`,
      name: airport.name || `${airportNames[i]} Airport`,
      type: 'RAILROAD',
      price: airport.price || 200,
      rent: [25, 50, 100, 200], // Standard railroad rent
      houses: 0,
      isMortgaged: false,
      icon: '✈️'
    };
  });
  
  // 3. Place special tiles (Chance, Community Chest, Tax)
  config.specialTiles.forEach((special, i) => {
    if (tiles[special.position] === null) {
      tiles[special.position] = {
        id: `special_${special.type.toLowerCase()}_${i}`,
        name: special.type === 'TAX' ? (special.taxName || 'Tax') : 
              special.type === 'CHANCE' ? 'Chance' : 'Community Chest',
        type: special.type,
        price: special.type === 'TAX' ? special.taxAmount : undefined,
        houses: 0,
        isMortgaged: false,
        icon: special.type === 'CHANCE' ? '❓' : 
              special.type === 'COMMUNITY_CHEST' ? '📦' : '💸'
      };
    }
  });
  
  // 4. Sort countries by rank and place properties
  const sortedCountries = [...config.countries].sort((a, b) => a.rank - b.rank);
  
  // Collect all property slots (empty positions)
  const propertySlots: number[] = [];
  for (let i = 0; i < config.tileCount; i++) {
    if (tiles[i] === null) {
      propertySlots.push(i);
    }
  }
  
  // Calculate total properties needed
  const totalProperties = sortedCountries.reduce((sum, c) => sum + c.cities.length, 0);
  
  if (propertySlots.length < totalProperties) {
    throw new Error(`Not enough slots for properties. Have ${propertySlots.length}, need ${totalProperties}`);
  }
  
  // Place properties in order (cheapest to richest from GO)
  let slotIndex = 0;
  sortedCountries.forEach(country => {
    const basePrice = BASE_COUNTRY_PRICES[country.rank] || 100;
    
    country.cities.forEach((city, cityIndex) => {
      if (slotIndex < propertySlots.length) {
        const position = propertySlots[slotIndex];
        const price = Math.round(basePrice * city.priceMultiplier);
        const rent = calculateRent(price);
        const houseCost = calculateHouseCost(price);
        
        tiles[position] = {
          id: `prop_${country.id}_${cityIndex}`,
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
        
        slotIndex++;
      }
    });
  });
  
  // Fill any remaining slots with default tiles
  for (let i = slotIndex; i < propertySlots.length; i++) {
    const position = propertySlots[i];
    tiles[position] = {
      id: `empty_${position}`,
      name: 'Community Chest',
      type: 'COMMUNITY_CHEST',
      houses: 0,
      isMortgaged: false,
      icon: '📦'
    };
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
    countries: defaultCountries,
    specialTiles: [
      { type: 'CHANCE', position: 7 },
      { type: 'COMMUNITY_CHEST', position: 2 },
      { type: 'CHANCE', position: 22 },
      { type: 'COMMUNITY_CHEST', position: 17 },
      { type: 'TAX', position: 4, taxAmount: 200, taxName: 'Income Tax' },
      { type: 'TAX', position: 38, taxAmount: 100, taxName: 'Luxury Tax' }
    ]
  };
};

export { CustomBoardConfig, CornerRules };
