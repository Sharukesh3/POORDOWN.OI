import React, { useMemo } from 'react';
import type { 
  CustomCountry,
  SpecialTilePlacement,
  CustomCompany
} from '../CustomBoardTypes';
import {
  getBoardPositions,
  BASE_COUNTRY_PRICES
} from '../CustomBoardTypes';
import './BoardPreview.css';

interface BoardPreviewProps {
  config: {
    tileCount: 40 | 48;
    countries: CustomCountry[];
    specialTiles: SpecialTilePlacement[];
    airports: { name: string; price: number }[];
    companies?: CustomCompany[];
  };
}

interface PreviewTile {
  id: string;
  name: string;
  type: string;
  icon?: string;
  group?: string;
  price?: number;
}

/**
 * Get reserved positions (airport and corner adjacent)
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
    const after = (corner + 1) % tileCount;
    cornerAdjacent.add(after);
    const before = (corner - 1 + tileCount) % tileCount;
    cornerAdjacent.add(before);
  });
  
  return { airportAdjacent, cornerAdjacent };
};

export const BoardPreview: React.FC<BoardPreviewProps> = ({ config }) => {
  const tiles = useMemo(() => {
    const result: (PreviewTile | null)[] = new Array(config.tileCount).fill(null);
    const positions = getBoardPositions(config.tileCount);
    const { airportAdjacent, cornerAdjacent } = getReservedPositions(positions, config.tileCount);
    
    // Limit and prepare companies (each used once)
    const maxCompanies = config.tileCount === 40 ? 2 : 3;
    const companyTiles: PreviewTile[] = (config.companies || []).slice(0, maxCompanies).map((company, i) => ({
      id: `utility_${i}`,
      name: company.name,
      type: 'UTILITY',
      icon: company.icon,
      price: company.price
    }));
    let companyIndex = 0;
    
    // Other separators (can repeat)
    const separatorPool: PreviewTile[] = [
      { id: 'tax_income', name: 'Income Tax', type: 'TAX', icon: '💸' },
      { id: 'chance_1', name: 'Chance', type: 'CHANCE', icon: '❓' },
      { id: 'chest_1', name: 'Community Chest', type: 'COMMUNITY_CHEST', icon: '📦' },
      { id: 'chance_2', name: 'Chance', type: 'CHANCE', icon: '❓' },
      { id: 'chest_2', name: 'Community Chest', type: 'COMMUNITY_CHEST', icon: '📦' },
      { id: 'tax_luxury', name: 'Luxury Tax', type: 'TAX', icon: '💎' }
    ];
    let separatorIndex = 0;
    
    const getNextSeparator = (pos: number): PreviewTile => {
      // Try company first if allowed
      if (companyIndex < companyTiles.length && !cornerAdjacent.has(pos)) {
        const company = companyTiles[companyIndex];
        companyIndex++;
        return company;
      }
      // Use other separators
      const tile = separatorPool[separatorIndex % separatorPool.length];
      separatorIndex++;
      return { ...tile, id: `${tile.type.toLowerCase()}_${separatorIndex}` };
    };
    
    // 1. Place corners
    result[positions.goPosition] = { id: 'go', name: 'GO', type: 'GO', icon: '🎯' };
    result[positions.jailPosition] = { id: 'jail', name: 'Jail', type: 'JAIL', icon: '🔒' };
    result[positions.freeParkingPosition] = { id: 'vacation', name: 'Vacation', type: 'FREE_PARKING', icon: '🏖️' };
    result[positions.goToJailPosition] = { id: 'go_to_jail', name: 'Go to Jail', type: 'GO_TO_JAIL', icon: '🚔' };
    
    // 2. Place airports
    positions.airportPositions.forEach((pos, idx) => {
      result[pos] = { 
        id: `airport_${idx}`, 
        name: config.airports[idx]?.name || 'Airport', 
        type: 'AIRPORT', 
        icon: '✈️',
        price: config.airports[idx]?.price || 200
      };
    });
    
    // 3. Place countries
    const sortedCountries = [...config.countries].sort((a, b) => a.rank - b.rank);
    
    const sides = [
      { start: 1, end: positions.jailPosition - 1, air: positions.airportPositions[0] },
      { start: positions.jailPosition + 1, end: positions.freeParkingPosition - 1, air: positions.airportPositions[1] },
      { start: positions.freeParkingPosition + 1, end: positions.goToJailPosition - 1, air: positions.airportPositions[2] },
      { start: positions.goToJailPosition + 1, end: config.tileCount - 1, air: positions.airportPositions[3] }
    ];
    
    const countriesPerSide = Math.ceil(sortedCountries.length / 4);
    let countryIdx = 0;
    
    for (const side of sides) {
      let pos = side.start;
      let countriesOnThisSide = 0;
      
      while (countryIdx < sortedCountries.length && countriesOnThisSide < countriesPerSide && pos <= side.end) {
        const country = sortedCountries[countryIdx];
        
        // Separator between countries
        if (countriesOnThisSide > 0 && pos !== side.air && !airportAdjacent.has(pos)) {
          result[pos] = getNextSeparator(pos);
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
          
          result[pos] = {
            id: `${country.id}_${cityIdx}`,
            name: city.name,
            type: 'PROPERTY',
            icon: country.flagEmoji,
            group: country.id,
            price
          };
          pos++;
          
          // Internal separator
          const needsInternalSeparator = 
            (country.cities.length === 2 && cityIdx === 0) ||
            (country.cities.length >= 3 && cityIdx === 1);
          
          if (needsInternalSeparator && cityIdx < country.cities.length - 1) {
            if (pos <= side.end && pos !== side.air && !airportAdjacent.has(pos)) {
              result[pos] = getNextSeparator(pos);
              pos++;
            }
          }
        }
        
        countryIdx++;
        countriesOnThisSide++;
      }
    }
    
    // Fill remaining
    for (let i = 0; i < result.length; i++) {
      if (!result[i]) {
        result[i] = getNextSeparator(i);
      }
    }
    
    return result as PreviewTile[];
  }, [config]);

  const tilesPerSide = config.tileCount / 4;
  const bottomRow = tiles.slice(0, tilesPerSide).reverse();
  const leftCol = [...tiles.slice(tilesPerSide, tilesPerSide * 2)].reverse();
  const topRow = tiles.slice(tilesPerSide * 2, tilesPerSide * 3);
  const rightCol = tiles.slice(tilesPerSide * 3, tilesPerSide * 4);

  const getTileColor = (tile: PreviewTile) => {
    if (tile.type === 'GO') return '#2ecc71';
    if (tile.type === 'JAIL') return '#e74c3c';
    if (tile.type === 'FREE_PARKING') return '#f39c12';
    if (tile.type === 'GO_TO_JAIL') return '#9b59b6';
    if (tile.type === 'AIRPORT') return '#3498db';
    if (tile.type === 'UTILITY') return '#8e44ad';
    if (tile.type === 'CHANCE') return '#e67e22';
    if (tile.type === 'COMMUNITY_CHEST') return '#1abc9c';
    if (tile.type === 'TAX') return '#95a5a6';
    if (tile.type === 'PROPERTY') {
      const country = config.countries.find(c => c.id === tile.group);
      if (country) {
        const colorMap: Record<number, string> = {
          1: '#8B4513', 2: '#03a9f4', 3: '#e91e63', 4: '#ff9800',
          5: '#f44336', 6: '#ffeb3b', 7: '#4caf50', 8: '#3f51b5',
          9: '#9c27b0', 10: '#00bcd4'
        };
        return colorMap[country.rank] || '#666';
      }
    }
    return '#444';
  };

  return (
    <div className="board-preview">
      <div className="preview-title">📍 Board Preview</div>
      <div className="preview-board" style={{ '--tiles-per-side': tilesPerSide } as React.CSSProperties}>
        <div className="preview-row top">
          {topRow.map((tile, i) => (
            <div 
              key={`top-${i}`} 
              className={`preview-tile ${tile.type.toLowerCase()}`}
              style={{ backgroundColor: getTileColor(tile) }}
              title={`${tile.name}${tile.price ? ` - $${tile.price}` : ''}`}
            >
              <span className="tile-icon">{tile.icon}</span>
            </div>
          ))}
        </div>
        
        <div className="preview-middle">
          <div className="preview-col left">
            {leftCol.map((tile, i) => (
              <div 
                key={`left-${i}`} 
                className={`preview-tile ${tile.type.toLowerCase()}`}
                style={{ backgroundColor: getTileColor(tile) }}
                title={`${tile.name}${tile.price ? ` - $${tile.price}` : ''}`}
              >
                <span className="tile-icon">{tile.icon}</span>
              </div>
            ))}
          </div>
          <div className="preview-center">
            <span>🎲</span>
            <span className="center-text">{config.tileCount} Tiles</span>
            <span className="center-text">{config.countries.length} Countries</span>
            <span className="center-text">{(config.companies || []).slice(0, config.tileCount === 40 ? 2 : 3).length} Companies</span>
          </div>
          <div className="preview-col right">
            {rightCol.map((tile, i) => (
              <div 
                key={`right-${i}`} 
                className={`preview-tile ${tile.type.toLowerCase()}`}
                style={{ backgroundColor: getTileColor(tile) }}
                title={`${tile.name}${tile.price ? ` - $${tile.price}` : ''}`}
              >
                <span className="tile-icon">{tile.icon}</span>
              </div>
            ))}
          </div>
        </div>
        
        <div className="preview-row bottom">
          {bottomRow.map((tile, i) => (
            <div 
              key={`bottom-${i}`} 
              className={`preview-tile ${tile.type.toLowerCase()}`}
              style={{ backgroundColor: getTileColor(tile) }}
              title={`${tile.name}${tile.price ? ` - $${tile.price}` : ''}`}
            >
              <span className="tile-icon">{tile.icon}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="preview-hint">Hover over tiles to see details</p>
    </div>
  );
};

export default BoardPreview;
