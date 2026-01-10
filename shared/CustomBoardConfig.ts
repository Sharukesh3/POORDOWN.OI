// ============================================
// CUSTOM BOARD CONFIGURATION TYPES
// Shared between client and server
// ============================================

/**
 * A city within a country/property group
 */
export interface CustomCity {
  name: string;
  /** Relative price within country (1.0 = base, 1.2 = 20% more, etc.) */
  priceMultiplier: number;
}

/**
 * A country (property group) with 2-4 cities
 */
export interface CustomCountry {
  id: string;
  name: string;
  /** Flag emoji for display, e.g., '🇩🇪' */
  flagEmoji: string;
  /** 2-4 cities, ordered from cheapest to richest */
  cities: CustomCity[];
  /** Rank 1-8 (or 1-10 for 48-tile), 1 = cheapest group */
  rank: number;
}

/**
 * Customizable rules for corner tiles
 */
export interface CornerRules {
  /** Money received when passing GO (default: 200) */
  goPassingCash: number;
  /** Fine to pay to get out of jail (default: 50) */
  jailFine: number;
  /** Max turns in jail before auto-release (default: 3) */
  jailMaxTurns: number;
  /** Number of inactive turns when landing on vacation (default: 0) */
  vacationInactiveTurns: number;
  /** How tax refund works on vacation: 'none', 'pool' (shared pot), 'individual' */
  vacationTaxRefund: 'none' | 'pool' | 'individual';
}

/**
 * Airport configuration (fixed position, customizable properties)
 */
export interface CustomAirport {
  name: string;
  /** Purchase price (default: 200) */
  price: number;
}

/**
 * Placement for Chance, Community Chest, or Tax tiles
 */
export interface SpecialTilePlacement {
  type: 'CHANCE' | 'COMMUNITY_CHEST' | 'TAX';
  /** Board position (cannot be corner or airport position) */
  position: number;
  /** Tax amount (only for TAX type) */
  taxAmount?: number;
  /** Tax name (only for TAX type) */
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
  /** Board size: 40 (standard) or 48 (expanded) */
  tileCount: 40 | 48;
  /** Custom rules for corner tiles */
  cornerRules: CornerRules;
  /** 4 airports (fixed positions, customizable names/prices) */
  airports: [CustomAirport, CustomAirport, CustomAirport, CustomAirport];
  /** Property groups (countries with cities) */
  countries: CustomCountry[];
  /** Special tile placements (Chance, Community Chest, Tax) */
  specialTiles: SpecialTilePlacement[];
}

/**
 * Default corner rules
 */
export const DEFAULT_CORNER_RULES: CornerRules = {
  goPassingCash: 200,
  jailFine: 50,
  jailMaxTurns: 3,
  vacationInactiveTurns: 0,
  vacationTaxRefund: 'none'
};

/**
 * Default airport configuration
 */
export const DEFAULT_AIRPORT: CustomAirport = {
  name: 'Airport',
  price: 200
};

/**
 * Get fixed positions for a board size
 */
export const getBoardPositions = (tileCount: 40 | 48) => {
  const tilesPerSide = (tileCount - 4) / 4; // 9 for 40-tile, 11 for 48-tile
  
  return {
    // Corners (fixed)
    goPosition: 0,
    jailPosition: tilesPerSide + 1,
    freeParkingPosition: (tilesPerSide + 1) * 2,
    goToJailPosition: (tilesPerSide + 1) * 3,
    
    // Airports (center of each side)
    airportPositions: [
      Math.floor(tilesPerSide / 2) + 1,                           // Bottom side
      (tilesPerSide + 1) + Math.floor(tilesPerSide / 2) + 1,     // Left side
      (tilesPerSide + 1) * 2 + Math.floor(tilesPerSide / 2) + 1, // Top side
      (tilesPerSide + 1) * 3 + Math.floor(tilesPerSide / 2) + 1  // Right side
    ] as [number, number, number, number],
    
    tilesPerSide
  };
};

/**
 * Base prices for each country rank (40-tile board)
 * These are multiplied for 48-tile boards
 */
export const BASE_COUNTRY_PRICES: Record<number, number> = {
  1: 60,
  2: 100,
  3: 140,
  4: 180,
  5: 220,
  6: 260,
  7: 300,
  8: 400
};

/**
 * Calculate rent array based on property price
 * Follows standard Monopoly rent ratios
 */
export const calculateRent = (price: number): number[] => {
  const baseRent = Math.round(price * 0.05); // ~5% of price
  return [
    baseRent,                    // Base rent
    baseRent * 5,                // 1 house
    baseRent * 15,               // 2 houses
    baseRent * 45,               // 3 houses
    Math.round(price * 4),       // 4 houses
    Math.round(price * 5.5)      // Hotel
  ];
};

/**
 * Calculate house cost based on property price
 */
export const calculateHouseCost = (price: number): number => {
  if (price <= 100) return 50;
  if (price <= 200) return 100;
  if (price <= 300) return 150;
  return 200;
};
