
import React, { useState, useEffect } from 'react';
import './TradeModal.css';
import type { Player, Tile } from '../types';

// Map flag emojis to country codes for image URLs
const getFlagUrl = (icon: string) => {
  const flagMap: {[key: string]: string} = {
    '🇬🇷': 'gr', '🇮🇹': 'it', '🇪🇸': 'es', '🇩🇪': 'de',
    '🇨🇳': 'cn', '🇫🇷': 'fr', '🇬🇧': 'gb', '🇺🇸': 'us',
    '🇯🇵': 'jp', '🇰🇷': 'kr', '🇧🇷': 'br', '🇮🇳': 'in',
    '🇦🇺': 'au', '🇨🇦': 'ca', '🇲🇽': 'mx', '🇷🇺': 'ru'
  };
  const code = flagMap[icon];
  return code ? `https://flagcdn.com/w80/${code}.png` : null;
};


interface TradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  myPlayer: Player;
  targetPlayer: Player;
  board: Tile[];
  onSendTrade: (offerMoney: number, offerProps: string[], requestMoney: number, requestProps: string[]) => void;
  // Optional initial values for viewing/countering
  initialOfferMoney?: number;
  initialOfferProps?: string[];
  initialRequestMoney?: number;
  initialRequestProps?: string[];
  isViewing: boolean; // If true, read-only or accept/reject mode (handled by parent mostly, but affects input state)
}

export const TradeModal: React.FC<TradeModalProps> = ({
  isOpen, onClose, myPlayer, targetPlayer, board, onSendTrade,
  initialOfferMoney = 0, initialOfferProps = [],
  initialRequestMoney = 0, initialRequestProps = [],
  isViewing
}) => {
  if (!isOpen) return null;

  // State
  const [offerMoney, setOfferMoney] = useState(initialOfferMoney);
  const [requestMoney, setRequestMoney] = useState(initialRequestMoney);
  const [selectedOfferProps, setSelectedOfferProps] = useState<string[]>(initialOfferProps);
  const [selectedRequestProps, setSelectedRequestProps] = useState<string[]>(initialRequestProps);

  // Reset state when opening/changing props
  useEffect(() => {
    setOfferMoney(initialOfferMoney);
    setRequestMoney(initialRequestMoney);
    setSelectedOfferProps(initialOfferProps);
    setSelectedRequestProps(initialRequestProps);
  }, [isOpen, initialOfferMoney, initialRequestMoney, initialOfferProps, initialRequestProps]);

  // Helper to process properties
  const getPlayerProperties = (player: Player) => {
     // Get all properties
    const allProps = player.properties.map(id => board.find(t => t.id === id)).filter(Boolean) as Tile[];
    
    // Filter: If viewing (review mode), ONLY show selected properties.
    // If NOT viewing (negotiate mode), show ALL properties.
    if (isViewing) {
        // We need to know which set to check against.
        // For myPlayer (sender of trade proposal to ME, or ME sending to them?)
        // If I am VIEWING a trade, myPlayer is ME. targetPlayer is THEM.
        // wait, TradeModal props: myPlayer, targetPlayer.
        // In App.tsx: myPlayer={myPlayer}, targetPlayer={sender}.
        // selectedOfferProps are derived from initialOfferProps (which are what THEY requested from ME).
        // selectedRequestProps are what THEY offered ME.
        // Actually, let's look at the mapping in App.tsx:
        // setTradeOfferProps(t.requestProperties) -> My stuff they want.
        // setTradeRequestProps(t.offerProperties) -> Their stuff they offer.
        
        // So `selectedOfferProps` = My properties involved.
        // `selectedRequestProps` = Their properties involved.
        
        // The list below uses `myProperties` and `targetProperties`.
        // So we filter `allProps` by checking if ID is in the respective selected list.
        
        // However, `getPlayerProperties` is generic. I need to pass the selected list to filter against.
        return allProps; // We will filter in render
    }
    return allProps;
  };

  const myPropertiesRaw = getPlayerProperties(myPlayer);
  const targetPropertiesRaw = getPlayerProperties(targetPlayer);
  
  // Apply filtering based on mode
  // Helper to map IDs to Tiles
  const mapIdsToTiles = (ids: string[]) => ids.map(id => board.find(t => t.id === id)).filter(Boolean) as Tile[];

  // Logic:
  // If viewing -> Show exactly what is in the trade offer (selected props)
  // If creating/editing -> Show ALL available properties so user can select/deselect them
  
  const myProperties = isViewing 
      ? mapIdsToTiles(selectedOfferProps)
      : myPropertiesRaw;
      
  const targetProperties = isViewing 
      ? mapIdsToTiles(selectedRequestProps)
      : targetPropertiesRaw;


  const toggleOfferProp = (id: string) => {
    if (isViewing) return;
    setSelectedOfferProps(prev => 
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const toggleRequestProp = (id: string) => {
    if (isViewing) return;
    setSelectedRequestProps(prev => 
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  // Property Card Component
  const PropertyItem = ({ tile, isSelected, onClick }: { tile: Tile, isSelected: boolean, onClick: () => void }) => {
    const flagUrl = tile.icon ? getFlagUrl(tile.icon) : null;
    
    // Determine color from group or tile definition
    const getColor = (group: string) => {
      const colors: Record<string, string> = {
        'BROWN': '#795548', 'LIGHT_BLUE': '#03a9f4', 'PINK': '#9c27b0', 'ORANGE': '#ff9800',
        'RED': '#f44336', 'YELLOW': '#ffeb3b', 'GREEN': '#4caf50', 'DARK_BLUE': '#3f51b5',
        'RAILROAD': '#333', 'UTILITY': '#aaa'
      };
      return colors[group] || '#555';
    };

    return (
      <div className={`property-item ${isSelected ? 'selected' : ''}`} onClick={onClick}>
        {/* Flag or Icon */}
         {flagUrl ? (
            <div className="property-flag" style={{ backgroundImage: `url(${flagUrl})` }}></div>
         ) : (
            <div className="property-icon-fallback" style={{ backgroundColor: getColor(tile.group || tile.type) }}>
                {tile.icon}
            </div>
         )}
        <span className="property-name">{tile.name}</span>
        <span className="property-price">${tile.price}</span>
      </div>
    );
  };

  const handleSubmit = () => {
    onSendTrade(offerMoney, selectedOfferProps, requestMoney, selectedRequestProps);
  };

  return (
    <div className="trade-modal-overlay" onClick={onClose}>
      <div className="trade-modal" onClick={e => e.stopPropagation()}>
        <div className="trade-header">
          <h2> Trade Proposal </h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="trade-content">
          {/* LEFT COLUMN: YOU (OFFER) */}
          <div className="trade-column">
            <div className="column-header">
              <div className="player-avatar" style={{ background: myPlayer.color }}>{myPlayer.avatar || '😊'}</div>
              <div className="column-title">
                <h3>You Offer</h3>
                <small>Balance: ${myPlayer.money}</small>
              </div>
            </div>

            <div className="money-section">
              <label className="money-label">Cash Offer</label>
              <div className="money-input-row">
                <span>$</span>
                <input 
                  type="number" 
                  className="money-input" 
                  value={offerMoney} 
                  onChange={e => setOfferMoney(Math.min(Math.max(0, myPlayer.money), Math.max(0, parseInt(e.target.value) || 0)))}
                  disabled={isViewing}
                />
              </div>
            </div>

            <div className="properties-list">
              {myProperties.length === 0 && <div className="empty-props">{isViewing ? 'No properties offerred' : 'No properties to trade'}</div>}
              {myProperties.map(tile => (
                <PropertyItem 
                  key={tile.id} 
                  tile={tile} 
                  isSelected={selectedOfferProps.includes(tile.id)} 
                  onClick={() => toggleOfferProp(tile.id)} 
                />
              ))}
            </div>
          </div>

          {/* RIGHT COLUMN: THEM (REQUEST) */}
          <div className="trade-column">
             <div className="column-header">
              <div className="player-avatar" style={{ background: targetPlayer.color }}>{targetPlayer.avatar || '👤'}</div>
              <div className="column-title">
                <h3>{targetPlayer.name} Gives</h3>
                <small>Balance: ${targetPlayer.money}</small>
              </div>
            </div>

            <div className="money-section">
              <label className="money-label">Cash Request</label>
              <div className="money-input-row">
                <span>$</span>
                <input 
                  type="number" 
                  className="money-input" 
                  value={requestMoney} 
                  onChange={e => setRequestMoney(Math.min(Math.max(0, targetPlayer.money), Math.max(0, parseInt(e.target.value) || 0)))}
                  disabled={isViewing}
                />
              </div>
            </div>

            <div className="properties-list">
              {targetProperties.length === 0 && <div className="empty-props">{isViewing ? 'No properties requested' : 'No properties available'}</div>}
              {targetProperties.map(tile => (
                <PropertyItem 
                  key={tile.id} 
                  tile={tile} 
                  isSelected={selectedRequestProps.includes(tile.id)} 
                  onClick={() => toggleRequestProp(tile.id)} 
                />
              ))}
            </div>
          </div>
        </div>

        {/* Footer actions for CREATE/EDIT mode actions, VIEW actions are handled by parent usually */}
        <div className="trade-footer">
          <button className="btn-cancel" onClick={onClose}>Cancel</button>
          {!isViewing && (
            <button className="btn-confirm" onClick={handleSubmit}>
              Send Offer
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
