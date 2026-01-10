import React, { useMemo } from 'react';
import type { 
  CustomCountry,
  SpecialTilePlacement
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

export const BoardPreview: React.FC<BoardPreviewProps> = ({ config }) => {
  const tiles = useMemo(() => {
    const result: PreviewTile[] = new Array(config.tileCount).fill(null);
    const positions = getBoardPositions(config.tileCount);
    
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
    
    // 3. Place special tiles
    config.specialTiles.forEach(tile => {
      if (!result[tile.position]) {
        result[tile.position] = {
          id: `special_${tile.position}`,
          name: tile.type === 'TAX' ? (tile.taxName || 'Tax') : tile.type.replace('_', ' '),
          type: tile.type,
          icon: tile.type === 'CHANCE' ? '❓' : tile.type === 'COMMUNITY_CHEST' ? '📦' : '💰'
        };
      }
    });
    
    // 4. Place properties from countries
    const sortedCountries = [...config.countries].sort((a, b) => a.rank - b.rank);
    const emptySlots: number[] = [];
    for (let i = 0; i < config.tileCount; i++) {
      if (!result[i]) emptySlots.push(i);
    }
    
    let slotIndex = 0;
    sortedCountries.forEach(country => {
      country.cities.forEach((city, cityIdx) => {
        if (slotIndex < emptySlots.length) {
          const basePrice = BASE_COUNTRY_PRICES[country.rank] || 100;
          const price = Math.round(basePrice * city.priceMultiplier);
          result[emptySlots[slotIndex]] = {
            id: `${country.id}_${cityIdx}`,
            name: city.name,
            type: 'PROPERTY',
            icon: country.flagEmoji,
            group: country.id,
            price
          };
          slotIndex++;
        }
      });
    });
    
    // Fill any remaining nulls
    for (let i = 0; i < result.length; i++) {
      if (!result[i]) {
        result[i] = { id: `empty_${i}`, name: '?', type: 'EMPTY', icon: '?' };
      }
    }
    
    return result;
  }, [config]);

  // For a 40-tile board: 10 tiles per side (including corners)
  // Bottom: 0-9 (GO to before Jail)
  // Left: 10-19 (Jail to before Vacation)
  // Top: 20-29 (Vacation to before Go to Jail)
  // Right: 30-39 (Go to Jail to before GO wraps)
  const tilesPerSide = config.tileCount / 4;

  // Get tiles for each side
  const bottomRow = tiles.slice(0, tilesPerSide).reverse();  // 0-9 reversed for visual
  const leftCol = [...tiles.slice(tilesPerSide, tilesPerSide * 2)].reverse();  // 10-19 reversed (bottom to top)
  const topRow = tiles.slice(tilesPerSide * 2, tilesPerSide * 3);  // 20-29
  const rightCol = tiles.slice(tilesPerSide * 3, tilesPerSide * 4);  // 30-39 (top to bottom)

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
        {/* Top row */}
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
        
        {/* Middle section with left and right columns */}
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
        
        {/* Bottom row */}
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
