import React, { useState } from 'react';
import type { 
  CustomBoardConfig, 
  CustomCountry, 
  CustomCity,
  CornerRules,
  CustomAirport,
  SpecialTilePlacement
} from '../CustomBoardTypes';
import {
  DEFAULT_CORNER_RULES,
  DEFAULT_COUNTRIES,
  BASE_COUNTRY_PRICES,
  getBoardPositions
} from '../CustomBoardTypes';
import './BoardCreator.css';

interface BoardCreatorProps {
  onSave: (config: CustomBoardConfig) => void;
  onSaveAndCreateRoom?: (config: CustomBoardConfig) => void;
  onCancel: () => void;
  playerId: string;
}

export const BoardCreator: React.FC<BoardCreatorProps> = ({ onSave, onSaveAndCreateRoom, onCancel, playerId }) => {
  const [boardName, setBoardName] = useState('My Custom Board');
  const [tileCount, setTileCount] = useState<40 | 48>(40);
  const [cornerRules, setCornerRules] = useState<CornerRules>({ ...DEFAULT_CORNER_RULES });
  const [airports, setAirports] = useState<[CustomAirport, CustomAirport, CustomAirport, CustomAirport]>([
    { name: 'South Airport', price: 200 },
    { name: 'West Airport', price: 200 },
    { name: 'North Airport', price: 200 },
    { name: 'East Airport', price: 200 }
  ]);
  const [countries, setCountries] = useState<CustomCountry[]>([...DEFAULT_COUNTRIES]);
  const [specialTiles, setSpecialTiles] = useState<SpecialTilePlacement[]>([
    { type: 'CHANCE', position: 7 },
    { type: 'COMMUNITY_CHEST', position: 2 },
    { type: 'CHANCE', position: 22 },
    { type: 'COMMUNITY_CHEST', position: 17 },
    { type: 'TAX', position: 4, taxAmount: 200, taxName: 'Income Tax' },
    { type: 'TAX', position: 38, taxAmount: 100, taxName: 'Luxury Tax' }
  ]);
  const [activeTab, setActiveTab] = useState<'basics' | 'corners' | 'airports' | 'countries' | 'special'>('basics');
  const [selectedCountryId, setSelectedCountryId] = useState<string | null>(null);

  const positions = getBoardPositions(tileCount);
  
  // Calculate total cities
  const totalCities = countries.reduce((sum, c) => sum + c.cities.length, 0);
  const expectedCountries = tileCount === 40 ? 8 : 10;

  const handleSave = () => {
    const config: CustomBoardConfig = {
      id: `custom_${Date.now()}`,
      name: boardName,
      createdBy: playerId,
      createdAt: Date.now(),
      tileCount,
      cornerRules,
      airports,
      countries,
      specialTiles
    };
    onSave(config);
  };

  const handleSaveAndCreateRoom = () => {
    const config: CustomBoardConfig = {
      id: `custom_${Date.now()}`,
      name: boardName,
      createdBy: playerId,
      createdAt: Date.now(),
      tileCount,
      cornerRules,
      airports,
      countries,
      specialTiles
    };
    onSaveAndCreateRoom?.(config);
  };

  const updateCountry = (id: string, updates: Partial<CustomCountry>) => {
    setCountries(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const addCity = (countryId: string) => {
    setCountries(prev => prev.map(c => {
      if (c.id === countryId && c.cities.length < 4) {
        return { ...c, cities: [...c.cities, { name: 'New City', priceMultiplier: 1.0 }] };
      }
      return c;
    }));
  };

  const removeCity = (countryId: string, cityIndex: number) => {
    setCountries(prev => prev.map(c => {
      if (c.id === countryId && c.cities.length > 2) {
        return { ...c, cities: c.cities.filter((_, i) => i !== cityIndex) };
      }
      return c;
    }));
  };

  const updateCity = (countryId: string, cityIndex: number, updates: Partial<CustomCity>) => {
    setCountries(prev => prev.map(c => {
      if (c.id === countryId) {
        return {
          ...c,
          cities: c.cities.map((city, i) => i === cityIndex ? { ...city, ...updates } : city)
        };
      }
      return c;
    }));
  };

  const addCountry = () => {
    const newId = `country_${Date.now()}`;
    const newRank = countries.length + 1;
    setCountries(prev => [...prev, {
      id: newId,
      name: 'New Country',
      flagEmoji: '🏳️',
      rank: newRank,
      cities: [
        { name: 'City 1', priceMultiplier: 1.0 },
        { name: 'City 2', priceMultiplier: 1.0 }
      ]
    }]);
  };

  const removeCountry = (id: string) => {
    if (countries.length > 2) {
      setCountries(prev => prev.filter(c => c.id !== id));
    }
  };

  const selectedCountry = countries.find(c => c.id === selectedCountryId);

  return (
    <div className="board-creator">
      <div className="board-creator-header">
        <h2>🎮 Create Custom Board</h2>
        <div className="board-creator-actions">
          <button className="btn-cancel" onClick={onCancel}>Cancel</button>
          <button className="btn-save" onClick={handleSave}>Save Board</button>
          {onSaveAndCreateRoom && (
            <button className="btn-save-create" onClick={handleSaveAndCreateRoom}>Save & Create Room</button>
          )}
        </div>
      </div>

      <div className="board-creator-tabs">
        <button className={activeTab === 'basics' ? 'active' : ''} onClick={() => setActiveTab('basics')}>
          📋 Basics
        </button>
        <button className={activeTab === 'corners' ? 'active' : ''} onClick={() => setActiveTab('corners')}>
          🔲 Corner Rules
        </button>
        <button className={activeTab === 'airports' ? 'active' : ''} onClick={() => setActiveTab('airports')}>
          ✈️ Airports
        </button>
        <button className={activeTab === 'countries' ? 'active' : ''} onClick={() => setActiveTab('countries')}>
          🌍 Countries ({countries.length})
        </button>
        <button className={activeTab === 'special' ? 'active' : ''} onClick={() => setActiveTab('special')}>
          🎲 Special Tiles
        </button>
      </div>

      <div className="board-creator-content">
        {activeTab === 'basics' && (
          <div className="tab-content">
            <div className="form-group">
              <label>Board Name</label>
              <input 
                type="text" 
                value={boardName} 
                onChange={e => setBoardName(e.target.value)} 
                placeholder="My Custom Board"
              />
            </div>
            <div className="form-group">
              <label>Board Size</label>
              <div className="tile-count-selector">
                <button 
                  className={tileCount === 40 ? 'active' : ''} 
                  onClick={() => setTileCount(40)}
                >
                  40 Tiles (Standard)
                </button>
                <button 
                  className={tileCount === 48 ? 'active' : ''} 
                  onClick={() => setTileCount(48)}
                >
                  48 Tiles (Expanded)
                </button>
              </div>
              <p className="hint">
                Standard: 8 countries, 9 tiles per side<br/>
                Expanded: 10 countries, 11 tiles per side
              </p>
            </div>
            <div className="board-stats">
              <h4>📊 Board Statistics</h4>
              <p>Countries: {countries.length} / {expectedCountries}</p>
              <p>Total Cities: {totalCities}</p>
              <p>Airports: 4 (fixed at center of each side)</p>
              <p>Special Tiles: {specialTiles.length}</p>
            </div>
          </div>
        )}

        {activeTab === 'corners' && (
          <div className="tab-content">
            <h3>🎯 GO Tile</h3>
            <div className="form-group">
              <label>Passing Cash</label>
              <input 
                type="number" 
                value={cornerRules.goPassingCash} 
                onChange={e => setCornerRules(p => ({ ...p, goPassingCash: parseInt(e.target.value) || 0 }))}
              />
              <p className="hint">Money received when passing GO</p>
            </div>

            <h3>🔒 Jail Tile</h3>
            <div className="form-group">
              <label>Bail Fine ($)</label>
              <input 
                type="number" 
                value={cornerRules.jailFine} 
                onChange={e => setCornerRules(p => ({ ...p, jailFine: parseInt(e.target.value) || 0 }))}
              />
            </div>
            <div className="form-group">
              <label>Max Turns in Jail</label>
              <input 
                type="number" 
                min="1" 
                max="5"
                value={cornerRules.jailMaxTurns} 
                onChange={e => setCornerRules(p => ({ ...p, jailMaxTurns: parseInt(e.target.value) || 3 }))}
              />
              <p className="hint">Auto-release after this many turns</p>
            </div>

            <h3>🅿️ Vacation (Free Parking)</h3>
            <div className="form-group">
              <label>Inactive Turns</label>
              <input 
                type="number" 
                min="0" 
                max="5"
                value={cornerRules.vacationInactiveTurns} 
                onChange={e => setCornerRules(p => ({ ...p, vacationInactiveTurns: parseInt(e.target.value) || 0 }))}
              />
              <p className="hint">Number of turns player skips (0 = no vacation)</p>
            </div>
            <div className="form-group">
              <label>Tax Refund Mode</label>
              <select 
                value={cornerRules.vacationTaxRefund}
                onChange={e => setCornerRules(p => ({ ...p, vacationTaxRefund: e.target.value as 'none' | 'pool' | 'individual' }))}
              >
                <option value="none">None</option>
                <option value="pool">Pool (All taxes collected)</option>
                <option value="individual">Individual (Own taxes only)</option>
              </select>
            </div>
          </div>
        )}

        {activeTab === 'airports' && (
          <div className="tab-content">
            <p className="info-box">
              ✈️ Airports are fixed at the center of each side. You can customize their names and prices.
            </p>
            {['South', 'West', 'North', 'East'].map((dir, idx) => (
              <div key={dir} className="airport-item">
                <h4>{dir} Side (Position {positions.airportPositions[idx]})</h4>
                <div className="form-row">
                  <div className="form-group">
                    <label>Name</label>
                    <input 
                      type="text" 
                      value={airports[idx].name}
                      onChange={e => {
                        const newAirports = [...airports] as typeof airports;
                        newAirports[idx] = { ...newAirports[idx], name: e.target.value };
                        setAirports(newAirports);
                      }}
                    />
                  </div>
                  <div className="form-group">
                    <label>Price ($)</label>
                    <input 
                      type="number" 
                      value={airports[idx].price}
                      onChange={e => {
                        const newAirports = [...airports] as typeof airports;
                        newAirports[idx] = { ...newAirports[idx], price: parseInt(e.target.value) || 200 };
                        setAirports(newAirports);
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'countries' && (
          <div className="tab-content countries-tab">
            <div className="countries-list">
              <div className="countries-header">
                <h4>Countries ({countries.length}/{expectedCountries})</h4>
                {countries.length < expectedCountries && (
                  <button className="btn-add" onClick={addCountry}>+ Add Country</button>
                )}
              </div>
              {countries.sort((a, b) => a.rank - b.rank).map(country => (
                <div 
                  key={country.id} 
                  className={`country-item ${selectedCountryId === country.id ? 'selected' : ''}`}
                  onClick={() => setSelectedCountryId(country.id)}
                >
                  <span className="country-flag">{country.flagEmoji}</span>
                  <span className="country-name">{country.name}</span>
                  <span className="country-rank">Rank #{country.rank}</span>
                  <span className="country-cities">{country.cities.length} cities</span>
                  <span className="country-price">${BASE_COUNTRY_PRICES[country.rank] || 100}</span>
                </div>
              ))}
            </div>
            <div className="country-editor">
              {selectedCountry ? (
                <>
                  <h4>Editing: {selectedCountry.name}</h4>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Country Name</label>
                      <input 
                        type="text" 
                        value={selectedCountry.name}
                        onChange={e => updateCountry(selectedCountry.id, { name: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>Flag Emoji</label>
                      <input 
                        type="text" 
                        value={selectedCountry.flagEmoji}
                        onChange={e => updateCountry(selectedCountry.id, { flagEmoji: e.target.value })}
                        maxLength={4}
                      />
                    </div>
                    <div className="form-group">
                      <label>Rank (1=cheapest)</label>
                      <input 
                        type="number" 
                        min="1"
                        max={expectedCountries}
                        value={selectedCountry.rank}
                        onChange={e => updateCountry(selectedCountry.id, { rank: parseInt(e.target.value) || 1 })}
                      />
                    </div>
                  </div>
                  
                  <h5>Cities (2-4 per country)</h5>
                  <p className="hint">Order from cheapest to richest. Price multiplier adjusts rent.</p>
                  
                  {selectedCountry.cities.map((city, idx) => (
                    <div key={idx} className="city-item">
                      <span className="city-number">#{idx + 1}</span>
                      <input 
                        type="text" 
                        value={city.name}
                        onChange={e => updateCity(selectedCountry.id, idx, { name: e.target.value })}
                        placeholder="City name"
                      />
                      <div className="multiplier-input">
                        <label>×</label>
                        <input 
                          type="number" 
                          step="0.1"
                          min="0.5"
                          max="2"
                          value={city.priceMultiplier}
                          onChange={e => updateCity(selectedCountry.id, idx, { priceMultiplier: parseFloat(e.target.value) || 1 })}
                        />
                      </div>
                      {selectedCountry.cities.length > 2 && (
                        <button className="btn-remove" onClick={() => removeCity(selectedCountry.id, idx)}>✕</button>
                      )}
                    </div>
                  ))}
                  
                  <div className="city-actions">
                    {selectedCountry.cities.length < 4 && (
                      <button className="btn-add" onClick={() => addCity(selectedCountry.id)}>+ Add City</button>
                    )}
                    {countries.length > 2 && (
                      <button className="btn-remove-country" onClick={() => removeCountry(selectedCountry.id)}>
                        🗑️ Remove Country
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <p className="no-selection">← Select a country to edit</p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'special' && (
          <div className="tab-content">
            <p className="info-box">
              🎲 Place Chance, Community Chest, and Tax tiles on the board.
              Avoid corners (0, {positions.jailPosition}, {positions.freeParkingPosition}, {positions.goToJailPosition}) 
              and airports ({positions.airportPositions.join(', ')}).
            </p>
            
            <div className="special-tiles-list">
              {specialTiles.map((tile, idx) => (
                <div key={idx} className="special-tile-item">
                  <select 
                    value={tile.type}
                    onChange={e => {
                      const newTiles = [...specialTiles];
                      newTiles[idx] = { ...newTiles[idx], type: e.target.value as typeof tile.type };
                      setSpecialTiles(newTiles);
                    }}
                  >
                    <option value="CHANCE">Chance (Surprise)</option>
                    <option value="COMMUNITY_CHEST">Community Chest (Treasure)</option>
                    <option value="TAX">Tax</option>
                  </select>
                  <input 
                    type="number" 
                    min="1"
                    max={tileCount - 1}
                    value={tile.position}
                    onChange={e => {
                      const newTiles = [...specialTiles];
                      newTiles[idx] = { ...newTiles[idx], position: parseInt(e.target.value) || 1 };
                      setSpecialTiles(newTiles);
                    }}
                    placeholder="Position"
                  />
                  {tile.type === 'TAX' && (
                    <>
                      <input 
                        type="text" 
                        value={tile.taxName || ''}
                        onChange={e => {
                          const newTiles = [...specialTiles];
                          newTiles[idx] = { ...newTiles[idx], taxName: e.target.value };
                          setSpecialTiles(newTiles);
                        }}
                        placeholder="Tax name"
                      />
                      <input 
                        type="number" 
                        value={tile.taxAmount || 0}
                        onChange={e => {
                          const newTiles = [...specialTiles];
                          newTiles[idx] = { ...newTiles[idx], taxAmount: parseInt(e.target.value) || 0 };
                          setSpecialTiles(newTiles);
                        }}
                        placeholder="Amount"
                      />
                    </>
                  )}
                  <button 
                    className="btn-remove"
                    onClick={() => setSpecialTiles(prev => prev.filter((_, i) => i !== idx))}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            
            <button 
              className="btn-add"
              onClick={() => setSpecialTiles(prev => [...prev, { type: 'CHANCE', position: 1 }])}
            >
              + Add Special Tile
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default BoardCreator;
