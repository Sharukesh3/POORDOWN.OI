import React from 'react';
import type { GameState, Tile } from '../types';
import './Board.css';
import { Dice } from './Dice';

interface BoardProps {
  gameState: GameState;
  currentPlayerId?: string;
  onTileClick?: (tile: Tile) => void;
  highlightedTile?: number | null;
  animatingPlayerId?: string | null;
  animationPosition?: number | null;
  // Action handlers
  onRoll?: () => void;
  onBuy?: () => void;
  onDecline?: () => void;
  onEndTurn?: () => void;
  onPayJailFine?: () => void;
  onUseJailCard?: () => void;
  isMyTurn?: boolean;
  canBuy?: boolean; // Now means "Show Buy Actions"
  canAfford?: boolean;
  isRolling?: boolean;
  // Property Expansion & Management
  expandedTile?: Tile | null;
  onCloseExpanded?: () => void;
  onMortgage?: (tileId: string) => void;
  onUnmortgage?: (tileId: string) => void;
  onBuildHouse?: (tileId: string) => void;
  onSellHouse?: (tileId: string) => void;
  onSellProperty?: (tileId: string) => void;
  // Board zoom state controlled from parent
  isExpanded?: boolean;
}

// Calculate estimated tax based on player's money
const calculateTax = (playerMoney: number, tileId?: string): { amount: number; rate: string } => {
  if (tileId === 'luxury_tax') {
    return { amount: 75, rate: 'Flat' };
  }

  let taxRate: number;
  let rateName: string;
  
  if (playerMoney < 500) {
    taxRate = 0.05;
    rateName = '5%';
  } else if (playerMoney < 1000) {
    taxRate = 0.10;
    rateName = '10%';
  } else if (playerMoney < 2000) {
    taxRate = 0.15;
    rateName = '15%';
  } else {
    taxRate = 0.20;
    rateName = '20%';
  }
  
  const tax = Math.max(Math.floor(playerMoney * taxRate), 50);
  return { amount: tax, rate: rateName };

};


export const Board: React.FC<BoardProps> = ({ 
  gameState, currentPlayerId, onTileClick, highlightedTile, animatingPlayerId, animationPosition,
  onRoll, onBuy, onDecline, onEndTurn, onPayJailFine, onUseJailCard, isMyTurn, canBuy, canAfford, isRolling,
  expandedTile, onCloseExpanded, onMortgage, onUnmortgage, onBuildHouse, onSellHouse, isExpanded
}) => {
  const { board, players } = gameState;
  const currentPlayer = players.find(p => p.id === currentPlayerId);
  const myPlayer = currentPlayer;
  const currentTurnPlayer = players[gameState.currentPlayerIndex]; // The player whose turn it is

  // Refs for all tiles to calculate positions
  const tileRefs = React.useRef<Map<number, HTMLDivElement>>(new Map());
  const [overlayStyle, setOverlayStyle] = React.useState<{top: number, left: number, width: number, height: number} | null>(null);

  // Update overlay position when animationPosition changes
  React.useEffect(() => {
    if (animatingPlayerId && animationPosition !== null && animationPosition !== undefined) {
      const tileEl = tileRefs.current.get(animationPosition);
      if (tileEl) {
        // Get the token container relative position within the tile? 
        // Or just center it on the tile. Let's start with centering on the tile.
        // We need coordinates relative to the .monopoly-board-container
        const boardEl = tileEl.closest('.monopoly-board-container');
        if (boardEl) {
          const tileRect = tileEl.getBoundingClientRect();
          const boardRect = boardEl.getBoundingClientRect();
          
          setOverlayStyle({
            top: tileRect.top - boardRect.top,
            left: tileRect.left - boardRect.left,
            width: tileRect.width,
            height: tileRect.height
          });
        }
      }
    } else {
      setOverlayStyle(null);
    }
  }, [animationPosition, animatingPlayerId]);

  // Check if any property in the group has buildings
  const hasBuildingsInGroup = (group: string) => {
    return board.some(t => t.group === group && t.houses > 0);
  };

  // Calculate board layout
  const total = board.length;
  const sideCount = (total - 4) / 4;

  // Corner indices
  const goIdx = 0;
  const jailIdx = sideCount + 1;
  const fpIdx = 2 * sideCount + 2;
  const gtjIdx = 3 * sideCount + 3;

  // Side slices
  const bottomTiles = board.slice(1, jailIdx);
  const leftTiles = board.slice(jailIdx + 1, fpIdx);
  const topTiles = board.slice(fpIdx + 1, gtjIdx);
  const rightTiles = board.slice(gtjIdx + 1, total);



  const renderTile = (tile: Tile, side: 'bottom' | 'left' | 'top' | 'right') => {
    if (!tile) return null;
    const tileIndex = board.indexOf(tile);
    const playersOnTile = players.filter(p => p.position === tileIndex && !p.isBankrupt); // Regular players
    const owner = tile.owner ? players.find(p => p.id === tile.owner) : null;
    const isHighlighted = highlightedTile === tileIndex;
    
    // Check if this tile's panel is open
    const isPanelOpen = expandedTile?.id === tile.id;
    
    // Determine panel expand direction based on side
    const getExpandDirection = () => {
      switch (side) {
        case 'bottom': return 'expand-up';
        case 'top': return 'expand-down';
        case 'left': return 'expand-right';
        case 'right': return 'expand-left';
        default: return 'expand-up';
      }
    };
    
    // Check for monopoly (full group ownership)
    const isMonopoly = tile.group && tile.owner && board.filter(t => t.group === tile.group).every(t => t.owner === tile.owner);
    
    // Base style checks
    const tileStyle = tile.group ? {
      boxShadow: `inset 0 0 20px rgba(0,0,0,0.3)`
    } : {};
    
    // Additional styling for monopoly glow (border only)
    // Check if we should highlight this tile (e.g. for potential purchase/auction)
    const shouldHighlight = isHighlighted; 
    const additionalClasses = `${tile.isMortgaged ? 'mortgaged' : ''} ${owner ? 'owned' : ''} ${shouldHighlight ? 'highlighted' : ''} ${isMonopoly ? 'monopoly-glow' : ''} ${isPanelOpen ? 'panel-active' : ''}`;
    
    // Monopoly glow effect style (applied to outer div)
    const glowStyle = isMonopoly ? {
      '--glow-color': owner?.color,
      zIndex: 15,
      animation: 'monopoly-flash 2.5s ease-out forwards'
    } as React.CSSProperties : {};

    // Map flag emojis
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
    
    const flagUrl = tile.icon ? getFlagUrl(tile.icon) : null;

    // Disable click for non-interactive tiles
    const isInteractive = ['PROPERTY', 'RAILROAD', 'UTILITY', 'TAX'].includes(tile.type);

    const isChanceChest = tile.type === 'CHANCE' || tile.type === 'COMMUNITY_CHEST';
    
    // Add very subtle flag as background for property tiles
    const flagBackgroundStyle = flagUrl ? {
      backgroundImage: `linear-gradient(rgba(37, 37, 66, 0.85), rgba(37, 37, 66, 0.85)), url(${flagUrl})`,
      backgroundSize: '250% auto',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat'
    } : {};
    
    return (
      <div 
        key={tile.id} 
        ref={(el) => { if (el) tileRefs.current.set(tileIndex, el); }}
        className={`tile-base side-${side} ${additionalClasses} ${isChanceChest ? 'chance-chest' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          // Toggle: if panel is already open for this tile, close it; otherwise open
          if (isPanelOpen) {
            onCloseExpanded?.();
          } else {
            isInteractive && onTileClick?.(tile);
          }
        }}
        style={{...tileStyle, ...glowStyle, ...flagBackgroundStyle, cursor: isInteractive ? 'pointer' : 'default'}}
      >
        <div className="tile-content">
          {flagUrl ? (
            <div className="tile-flag">
              <img src={flagUrl} alt="" />
            </div>
          ) : tile.icon && (
            <div className={`tile-icon ${(tile.type === 'CHANCE' || tile.type === 'COMMUNITY_CHEST') ? 'icon-inside' : ''}`}>{tile.icon}</div>
          )}
          <div className="tile-name">
            {tile.type === 'RAILROAD' 
              ? tile.name.replace(' Airport', '').replace('Airport ', '') 
              : tile.type === 'UTILITY'
              ? tile.name.replace(' Company', '')
              : tile.name}
          </div>
          
          {/* Show dynamic tax for TAX tiles */}
          {tile.type === 'TAX' && currentPlayer && (
            <div className="tile-price tax-price">
              {calculateTax(currentPlayer.money, tile.id).rate} (${calculateTax(currentPlayer.money, tile.id).amount})
            </div>
          )}
          
          {tile.isMortgaged && (
            <div className="mortgage-overlay">
              <span className="mortgage-icon">💸</span>
            </div>
          )}
          


          {/* Visual Building Models */}
          {tile.type !== 'TAX' && tile.price !== undefined && !tile.isMortgaged && (tile.houses || 0) > 0 && (
            <div className="houses">
              {tile.houses === 5 ? (
                <div className="model-hotel" title="Hotel"></div>
              ) : (
                [...Array(tile.houses)].map((_, i) => (
                  <div key={i} className="model-house" title="House"></div>
                ))
              )}
            </div>
          )}
          
          {/* Price Bar / Owner Bar logic */}
          {tile.type !== 'TAX' && tile.price !== undefined && !tile.isMortgaged && (
            <div className={`tile-price-bar ${tile.owner ? 'owned' : ''}`} style={{ borderColor: owner?.color, background: owner ? owner.color : 'transparent' }}>
              {!owner ? (
                 <span className="price-text">${tile.price}</span>
              ) : (
                 <div className="owner-bar" style={{ background: owner.color }}></div> 
              )}
            </div>
          )}
        </div>
        
        {/* Regular player tokens (Static) - Do NOT show animating player here */}
        {playersOnTile.length > 0 && (
          <div className="token-container">
            {playersOnTile.map(p => {
              if (p.id === animatingPlayerId) return null; // Don't render the static token for the animating player
              return (
                 <div key={p.id} className="token" style={{ background: p.color }} title={p.name}>
                    {p.isJailed ? '🔒' : '👀'}
                 </div>
              );
            })}
          </div>
        )}

        {/* COLLAPSIBLE PROPERTY PANEL */}
        {isPanelOpen && tile.type !== 'TAX' && (
          <div 
            className={`tile-property-panel ${getExpandDirection()}`}
            onClick={(e) => e.stopPropagation()}
          >
            
            <div className="panel-header" style={{ background: tile.group ? `var(--group-${tile.group})` : '#444' }}>
              {tile.name}
            </div>
            
            <div className="panel-body">
              {tile.isMortgaged && (
                <div className="panel-mortgage-badge">⚠️ MORTGAGED</div>
              )}
              
              {/* Property rent with houses */}
              {tile.rent && tile.type === 'PROPERTY' && (
                <>
                  <div className="panel-rent-row"><span>Rent</span><span>${tile.rent[0]}</span></div>
                  <div className="panel-rent-row"><span>1 House</span><span>${tile.rent[1]}</span></div>
                  <div className="panel-rent-row"><span>2 Houses</span><span>${tile.rent[2]}</span></div>
                  <div className="panel-rent-row"><span>3 Houses</span><span>${tile.rent[3]}</span></div>
                  <div className="panel-rent-row"><span>4 Houses</span><span>${tile.rent[4]}</span></div>
                  <div className="panel-rent-row"><span>Hotel</span><span>${tile.rent[5]}</span></div>
                </>
              )}
              
              {/* Railroad/Airport rent */}
              {tile.type === 'RAILROAD' && (
                <>
                  <div className="panel-rent-row"><span>1 Airport</span><span>$25</span></div>
                  <div className="panel-rent-row"><span>2 Airports</span><span>$50</span></div>
                  <div className="panel-rent-row"><span>3 Airports</span><span>$100</span></div>
                  <div className="panel-rent-row"><span>4 Airports</span><span>$200</span></div>
                </>
              )}
              
              {/* Utility rent */}
              {tile.type === 'UTILITY' && (
                <div style={{textAlign: 'center', padding: '10px', color: '#888'}}>
                  Rent = Dice × 4 (or ×10 if both owned)
                </div>
              )}
            </div>
            
            <div className="panel-footer">
              <div className="panel-stat"><span className="panel-stat-icon">💰</span> ${tile.price}</div>
              {tile.houseCost && <div className="panel-stat"><span className="panel-stat-icon">🏠</span> ${tile.houseCost}</div>}
            </div>
            
            {/* Owner Actions */}
            {myPlayer?.id === tile.owner && isMyTurn && (
              <div className="panel-actions">
                {!tile.isMortgaged && tile.houses < 5 && (
                  <button className="panel-action-btn build" onClick={(e) => { e.stopPropagation(); onBuildHouse?.(tile.id); }}>
                    🏠+
                  </button>
                )}
                {tile.houses > 0 && (
                  <button className="panel-action-btn sell" onClick={(e) => { e.stopPropagation(); onSellHouse?.(tile.id); }}>
                    🏠-
                  </button>
                )}
                {!tile.isMortgaged && tile.houses === 0 && (!tile.group || !hasBuildingsInGroup(tile.group)) && (
                  <button className="panel-action-btn mortgage" onClick={(e) => { e.stopPropagation(); onMortgage?.(tile.id); }}>
                    📥 Mortgage
                  </button>
                )}
                {tile.isMortgaged && (
                  <button className="panel-action-btn unmortgage" onClick={(e) => { e.stopPropagation(); onUnmortgage?.(tile.id); }}>
                    🔄 Unmortgage
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderCorner = (tile: Tile | undefined, position: string) => {
    if (!tile) return <div className={`corner corner-${position}`}></div>;
    
    const tileIndex = board.indexOf(tile);
    const playersOnTile = players.filter(p => p.position === tileIndex && !p.isBankrupt);

    return (
      <div 
        className={`corner corner-${position}`} 
        onClick={() => onTileClick?.(tile)}
        ref={(el) => { if (el) tileRefs.current.set(tileIndex, el); }}
      >
        <div className="corner-content">
          <div className="corner-icon">{tile.icon}</div>
          <div className="corner-name">{tile.name}</div>
          {tile.type === 'FREE_PARKING' && gameState.config.vacationCash && myPlayer && myPlayer.vacationFund > 0 && (
            <div style={{fontSize: '0.7rem', color: '#00b894', fontWeight: 'bold', marginTop: '2px', background: 'rgba(0,0,0,0.5)', padding: '2px 4px', borderRadius: '4px'}}>
              ${myPlayer.vacationFund}
            </div>
          )}
        </div>
        {playersOnTile.length > 0 && (
          <div className="token-container">
            {playersOnTile.map(p => {
              if (p.id === animatingPlayerId) return null;
              return (
                <div key={p.id} className="token" style={{ background: p.color }}>
                  {p.isJailed && tile.type === 'JAIL' ? '🔒' : '👀'}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="board-wrapper">
      <div className={`monopoly-board-container ${isExpanded ? 'expanded' : ''}`}>
        {/* Corners */}
        {renderCorner(board[goIdx], 'br')}
        {renderCorner(board[jailIdx], 'bl')}
        {renderCorner(board[fpIdx], 'tl')}
        {renderCorner(board[gtjIdx], 'tr')}

        {/* Tile Strips */}
        <div className="board-row-bottom">
          {bottomTiles.map(t => renderTile(t, 'bottom'))}
        </div>
        <div className="board-col-left">
          {leftTiles.map(t => renderTile(t, 'left'))}
        </div>
        <div className="board-row-top">
          {topTiles.map(t => renderTile(t, 'top'))}
        </div>
        <div className="board-col-right">
          {rightTiles.map(t => renderTile(t, 'right'))}
        </div>

          {/* Center */}
        <div className="board-center" onClick={() => {
            if (expandedTile && onCloseExpanded) {
                // Clicking background closes it
                onCloseExpanded();
            }
        }}>
           {/* Default Center Content - property panel is now rendered on tiles */}
           <div className="turn-indicator">
               <span className="player-name-highlight">{currentTurnPlayer?.name || 'Player'}</span> is playing...
           </div> 
          
          {/* Keep Logs, Dice and Actions always visible */}

          {((gameState.dice && gameState.dice[0] > 0) || isRolling) && (
            <div className="dice-container">
              <Dice value={gameState.dice?.[0] || 1} rolling={!!isRolling} />
              <Dice value={gameState.dice?.[1] || 1} rolling={!!isRolling} />
            </div>
          )}


          {gameState.doublesCount > 0 && (
            <div className="doubles-indicator">
              🎲 Doubles! ({gameState.doublesCount})
            </div>
          )}

          {/* Action Log in Center */}
          <div className="action-log-center">
            <div className="action-log-header">📜 Game Log</div>
            <div className="action-log-content">
              {gameState.actionLog.slice(0, 8).map((log, i) => (
                <div key={i} className="action-log-entry">{log}</div>
              ))}
            </div>
          </div>

          {/* Action Buttons Below Game Log */}
          {isMyTurn && (
            <div className="board-actions">
              {/* Roll Dice / Jail Options */}
              {myPlayer?.isJailed ? (
                <div className="jail-options">
                  <button className="action-btn jail-btn" onClick={onPayJailFine}>
                    💰 Pay $50 Fine
                  </button>
                  {myPlayer.getOutOfJailCards > 0 && (
                    <button className="action-btn jail-btn" onClick={onUseJailCard}>
                      🎫 Use Card
                    </button>
                  )}
                  <button className="action-btn roll-btn" onClick={onRoll} disabled={isRolling}>
                    🎲 Roll for Doubles
                  </button>
                </div>
              ) : (
                <>
                  {(gameState.mustRoll || (gameState.canRollAgain && !canBuy)) && (
                    <button className="action-btn roll-btn" onClick={onRoll} disabled={isRolling}>
                      {isRolling ? '🎲 Rolling...' : gameState.canRollAgain ? '🎲 Roll Again!' : '🎲 Roll Dice'}
                    </button>
                  )}
                  {/* Wait for animation to finish before showing buy options */}
                  {canBuy && !animatingPlayerId && (
                    <div className="buy-options">
                      <button 
                        className="action-btn buy-btn" 
                        onClick={onBuy} 
                        disabled={!canAfford}
                        style={{ opacity: canAfford ? 1 : 0.5, cursor: canAfford ? 'pointer' : 'not-allowed' }}
                      >
                        ✓ Buy
                      </button>
                      <button className="action-btn auction-btn" onClick={onDecline}>🔨 Auction</button>
                    </div>
                  )}
                  {!gameState.mustRoll && !canBuy && !gameState.canRollAgain && (
                    <button className="action-btn end-turn-btn" onClick={onEndTurn}>
                      ⏭️ End Turn
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
        
        {/* Token Overlay for Smooth Animation */}
        {animatingPlayerId && overlayStyle && (
            <div 
              className="token-overlay-layer"
              style={{
                 position: 'absolute',
                 top: 0, left: 0, width: '100%', height: '100%',
                 pointerEvents: 'none',
                 zIndex: 999
              }}
            >
               <div 
                  className="moving-token"
                  style={{
                    position: 'absolute',
                    top: overlayStyle.top,
                    left: overlayStyle.left,
                    width: overlayStyle.width,
                    height: overlayStyle.height,
                    // Transition is the magic!
                    transition: 'all 80ms linear',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
               >
                 {(() => {
                    const p = players.find(x => x.id === animatingPlayerId);
                    if (!p) return null;
                    return (
                      <div 
                        className="token pulse-token" 
                        style={{ background: p.color, transform: 'scale(1.5)' }}
                        >
                         👀
                      </div>
                    );
                 })()}
               </div>
            </div>
        )}

      </div>
    </div>
  );
};
