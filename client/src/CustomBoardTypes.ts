// ============================================
// CUSTOM BOARD CONFIGURATION TYPES (CLIENT)
// ============================================

/**
 * A city within a country/property group
 */
export interface CustomCity {
  name: string;
  priceMultiplier: number;
}

/**
 * A country (property group) with 2-4 cities
 */
export interface CustomCountry {
  id: string;
  name: string;
  flagEmoji: string;
  cities: CustomCity[];
  rank: number;
}

/**
 * Customizable rules for corner tiles
 */
export interface CornerRules {
  goPassingCash: number;
  jailFine: number;
  jailMaxTurns: number;
  vacationInactiveTurns: number;
  vacationTaxRefund: 'none' | 'pool' | 'individual';
}

/**
 * Airport configuration
 */
export interface CustomAirport {
  name: string;
  price: number;
}

/**
 * Placement for special tiles
 */
export interface SpecialTilePlacement {
  type: 'CHANCE' | 'COMMUNITY_CHEST' | 'TAX';
  position: number;
  taxAmount?: number;
  taxName?: string;
}

/**
 * Complete custom board configuration
 */
export interface CustomBoardConfig {
  id: string;
  name: string;
  createdBy: string;
  createdAt: number;
  tileCount: 40 | 48;
  cornerRules: CornerRules;
  airports: [CustomAirport, CustomAirport, CustomAirport, CustomAirport];
  countries: CustomCountry[];
  specialTiles: SpecialTilePlacement[];
}

export const DEFAULT_CORNER_RULES: CornerRules = {
  goPassingCash: 200,
  jailFine: 50,
  jailMaxTurns: 3,
  vacationInactiveTurns: 0,
  vacationTaxRefund: 'none'
};

export const DEFAULT_AIRPORT: CustomAirport = {
  name: 'Airport',
  price: 200
};

export const getBoardPositions = (tileCount: 40 | 48) => {
  const tilesPerSide = (tileCount - 4) / 4;
  
  return {
    goPosition: 0,
    jailPosition: tilesPerSide + 1,
    freeParkingPosition: (tilesPerSide + 1) * 2,
    goToJailPosition: (tilesPerSide + 1) * 3,
    airportPositions: [
      Math.floor(tilesPerSide / 2) + 1,
      (tilesPerSide + 1) + Math.floor(tilesPerSide / 2) + 1,
      (tilesPerSide + 1) * 2 + Math.floor(tilesPerSide / 2) + 1,
      (tilesPerSide + 1) * 3 + Math.floor(tilesPerSide / 2) + 1
    ] as [number, number, number, number],
    tilesPerSide
  };
};

export const BASE_COUNTRY_PRICES: Record<number, number> = {
  1: 60, 2: 100, 3: 140, 4: 180, 5: 220, 6: 260, 7: 300, 8: 400
};

// Default countries template for board creation
export const DEFAULT_COUNTRIES: CustomCountry[] = [
  { id: 'greece', name: 'Greece', flagEmoji: '🇬🇷', rank: 1, cities: [{ name: 'Athens', priceMultiplier: 1.0 }, { name: 'Thessaloniki', priceMultiplier: 1.0 }] },
  { id: 'italy', name: 'Italy', flagEmoji: '🇮🇹', rank: 2, cities: [{ name: 'Rome', priceMultiplier: 1.0 }, { name: 'Milan', priceMultiplier: 1.1 }, { name: 'Venice', priceMultiplier: 1.2 }] },
  { id: 'spain', name: 'Spain', flagEmoji: '🇪🇸', rank: 3, cities: [{ name: 'Madrid', priceMultiplier: 1.0 }, { name: 'Barcelona', priceMultiplier: 1.1 }, { name: 'Seville', priceMultiplier: 1.2 }] },
  { id: 'germany', name: 'Germany', flagEmoji: '🇩🇪', rank: 4, cities: [{ name: 'Berlin', priceMultiplier: 1.0 }, { name: 'Munich', priceMultiplier: 1.1 }, { name: 'Hamburg', priceMultiplier: 1.2 }] },
  { id: 'france', name: 'France', flagEmoji: '🇫🇷', rank: 5, cities: [{ name: 'Paris', priceMultiplier: 1.0 }, { name: 'Lyon', priceMultiplier: 1.1 }, { name: 'Marseille', priceMultiplier: 1.2 }] },
  { id: 'uk', name: 'United Kingdom', flagEmoji: '🇬🇧', rank: 6, cities: [{ name: 'London', priceMultiplier: 1.0 }, { name: 'Manchester', priceMultiplier: 1.1 }, { name: 'Edinburgh', priceMultiplier: 1.2 }] },
  { id: 'japan', name: 'Japan', flagEmoji: '🇯🇵', rank: 7, cities: [{ name: 'Tokyo', priceMultiplier: 1.0 }, { name: 'Osaka', priceMultiplier: 1.1 }, { name: 'Kyoto', priceMultiplier: 1.2 }] },
  { id: 'usa', name: 'USA', flagEmoji: '🇺🇸', rank: 8, cities: [{ name: 'New York', priceMultiplier: 1.0 }, { name: 'Los Angeles', priceMultiplier: 1.5 }] }
];
