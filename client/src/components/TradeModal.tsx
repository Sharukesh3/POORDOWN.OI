
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
  isViewing: boolean; 
  onAccept?: () => void;
  onDecline?: () => void;
  onNegotiate?: () => void;
  isValid?: boolean; // For accept button
}

export const TradeModal: React.FC<TradeModalProps> = ({
  isOpen, onClose, myPlayer, targetPlayer, board, onSendTrade,
  initialOfferMoney = 0, initialOfferProps = [],
  initialRequestMoney = 0, initialRequestProps = [],
  isViewing,
  onAccept, onDecline, onNegotiate, isValid = true
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
    if (isViewing) {
        return allProps; // Filter logic is in render currently or implied by usage
    }
    return allProps;
  };

  const myPropertiesRaw = getPlayerProperties(myPlayer);
  const targetPropertiesRaw = getPlayerProperties(targetPlayer);
  
  // Apply filtering based on mode
  const mapIdsToTiles = (ids: string[]) => ids.map(id => board.find(t => t.id === id)).filter(Boolean) as Tile[];

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
          <h2>{isViewing ? 'View trade' : 'New Trade'}</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="trade-content">
          {/* LEFT COLUMN: YOU (OFFER) */}
          <div className="trade-column">
            <div className="column-header centered">
              <div className="player-avatar large" style={{ background: myPlayer.color }}>
                {myPlayer.avatar === 'pawn' ? '♟️' : (myPlayer.avatar === 'robot' ? '🤖' : (myPlayer.avatar || '😊'))}
              </div>
              <h3 className="player-name-title">{myPlayer.name}</h3>
              <div className="balance-pill">${myPlayer.money}</div>
            </div>

            <div className="money-section">
              <div className="money-input-row">
                <span>$</span>
                <input 
                  type="number" 
                  className="money-input" 
                  value={offerMoney} 
                  onChange={e => setOfferMoney(Math.min(Math.max(0, myPlayer.money), Math.max(0, parseInt(e.target.value) || 0)))}
                  disabled={isViewing}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="properties-list">
              {myProperties.length === 0 && <div className="empty-props">{isViewing ? 'No properties' : 'No properties'}</div>}
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

          {/* MIDDLE SEPARATOR */}
          <div className="trade-separator">
            <div className="exchange-icon">↔</div>
          </div>

          {/* RIGHT COLUMN: THEM (REQUEST) */}
          <div className="trade-column">
             <div className="column-header centered">
              <div className="player-avatar large" style={{ background: targetPlayer.color }}>
                {targetPlayer.avatar === 'pawn' ? '♟️' : (targetPlayer.avatar === 'robot' ? '🤖' : (targetPlayer.avatar || '👤'))}
              </div>
              <h3 className="player-name-title">{targetPlayer.name}</h3>
              <div className="balance-pill">${targetPlayer.money}</div>
            </div>

            <div className="money-section">
              <div className="money-input-row">
                <span>$</span>
                <input 
                  type="number" 
                  className="money-input" 
                  value={requestMoney} 
                  onChange={e => setRequestMoney(Math.min(Math.max(0, targetPlayer.money), Math.max(0, parseInt(e.target.value) || 0)))}
                  disabled={isViewing}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="properties-list">
              {targetProperties.length === 0 && <div className="empty-props">{isViewing ? 'No properties' : 'No properties'}</div>}
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

        {/* Footer actions */}
        <div className="trade-footer">
          {onAccept ? (
             // INCOMING TRADE ACTIONS
             <>
                <button className="btn-confirm" onClick={onAccept} disabled={!isValid} style={{background: '#6c5ce7'}}>
                   ✓ Confirm
                </button>
                <button className="btn-cancel" onClick={onDecline}>
                   × Decline
                </button>
                {onNegotiate && (
                    <button className="btn-cancel" onClick={onNegotiate} style={{background: 'rgba(108, 92, 231, 0.2)', color: '#a29bfe', border: '1px solid #6c5ce7'}}>
                        ✎ Negotiate
                    </button>
                )}
             </>
          ) : (
             // CREATE / SEND MODE
             <>
                <button className="btn-cancel" onClick={onClose}>Cancel</button>
                {!isViewing && (
                    <button className="btn-confirm" onClick={handleSubmit}>
                    Send Offer
                    </button>
                )}
             </>
          )}
        </div>
      </div>
    </div>
  );
};
