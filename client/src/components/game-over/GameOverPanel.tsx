import React, { useState } from 'react';
import type { GameState } from '../../types';
import { socket } from '../../services/socket';
import { DetailedStats } from './DetailedStats';
import './GameOverPanel.css'; // We will create this

interface GameOverPanelProps {
  gameState: GameState;
  onLeave: () => void;
}

export const GameOverPanel: React.FC<GameOverPanelProps> = ({ gameState, onLeave }) => {
  const [showDetails, setShowDetails] = useState(false);
  const winner = gameState.players.find(p => p.id === gameState.winnerId);
  const maxTurns = Math.max(...gameState.players.map(p => p.wealthHistory?.length || 0));

  // Sort players for leaderboard
  const sortedPlayers = [...gameState.players].sort((a, b) => {
    if (a.id === gameState.winnerId) return -1;
    if (b.id === gameState.winnerId) return 1;
    return b.wealthHistory.length - a.wealthHistory.length; // Sort by survival time
  });

  if (showDetails) {
    return <DetailedStats gameState={gameState} onClose={() => setShowDetails(false)} />;
  }

  return (
    <div className="game-over-overlay">
      <div className="game-over-content">
        
        {/* Center Hero Section */}
        <div className="hero-section">
            <div className="dice-decoration">
                🎲
            </div>
            <h1 className="game-over-title">Game over!</h1>
            <p className="winner-label">and the winner is...</p>
            
            <div className="winner-display">
                <div className="winner-avatar-large" style={{ borderColor: winner?.color }}>
                    <img 
                        src={`https://api.dicebear.com/7.x/bottts/svg?seed=${winner?.name}`} 
                        alt={winner?.name} 
                    />
                </div>
                <h2 className="winner-name-large">{winner?.name}</h2>
            </div>

            <div className="hero-actions">
                <button className="hero-btn primary" onClick={() => socket.emit('restart_game')}>
                    🔄 Another game
                </button>
                <button className="hero-btn secondary" onClick={onLeave}>
                    ❌ Back to lobby
                </button>
            </div>
        </div>

        {/* Right Stats Panel */}
        <div className="stats-panel-floating">
            <div className="stats-panel-header">
                <h3>Game statistics</h3>
            </div>
            
            <div className="leaderboard-section">
                <div className="leaderboard-header">
                    <span># Player</span>
                    <span>Turns survived</span>
                </div>
                
                <div className="leaderboard-list">
                    {sortedPlayers.map((player, index) => {
                        const isWinner = player.id === gameState.winnerId;
                        const turns = player.wealthHistory?.length || 0;
                        const width = isWinner ? 100 : Math.max(5, (turns / maxTurns) * 100);
                        
                        return (
                            <div key={player.id} className="leaderboard-row">
                                <div className="player-info">
                                    <span className="rank">{index + 1}</span>
                                    <div className="player-avatar-small" style={{ background: player.color }}>
                                        <img src={`https://api.dicebear.com/7.x/bottts/svg?seed=${player.name}`} alt="" />
                                    </div>
                                    <span className="player-name">{player.name}</span>
                                </div>
                                
                                <div className="progress-bar-container">
                                    <div 
                                        className={`progress-bar ${isWinner ? 'winner-bar' : 'survivor-bar'}`} 
                                        style={{ width: `${width}%`, backgroundColor: isWinner ? '#00e5ff' : '#ff7675' }}
                                    >
                                        <span className="bar-label">{isWinner ? 'winner' : turns}</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <button className="view-all-stats-btn" onClick={() => setShowDetails(true)}>
                📉 View all statistics
            </button>
        </div>

      </div>
    </div>
  );
};
