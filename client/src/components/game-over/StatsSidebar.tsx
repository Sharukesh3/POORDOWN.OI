import React from 'react';
import type { GameState, Player } from '../../types';

interface StatsSidebarProps {
  gameState: GameState;
  onViewDetails: () => void;
}

export const StatsSidebar: React.FC<StatsSidebarProps> = ({ gameState, onViewDetails }) => {
  // Sort players by position/wealth/status
  const sortedPlayers = [...gameState.players].sort((a, b) => {
    if (a.id === gameState.winnerId) return -1;
    if (b.id === gameState.winnerId) return 1;
    return b.wealthHistory[b.wealthHistory.length - 1] - a.wealthHistory[a.wealthHistory.length - 1];
  });

  const maxTurns = Math.max(...gameState.players.map(p => p.wealthHistory?.length || 0));

  return (
    <div className="stats-sidebar">
      <h3 className="sidebar-title">Game statistics</h3>
      
      <div className="leaderboard">
        <div className="leaderboard-header">
          <span># Player</span>
          <span>Turns survived</span>
        </div>
        
        {sortedPlayers.map((player, index) => {
          const isWinner = player.id === gameState.winnerId;
          const turns = player.wealthHistory?.length || 0;
          const percentage = (turns / maxTurns) * 100;
          
          return (
            <div key={player.id} className="leaderboard-row">
              <div className="player-info">
                <span className="rank">{index + 1}</span>
                <div className="avatar-small" style={{ backgroundColor: player.color }}>
                  {isWinner ? '👑' : '👤'}
                </div>
                <span className="name">{player.name}</span>
              </div>
              
              <div className="turns-bar-container">
                <div 
                  className={`turns-bar ${isWinner ? 'winner-bar' : 'loser-bar'}`} 
                  style={{ width: `${isWinner ? 100 : percentage}%` }}
                >
                  {isWinner ? 'winner' : turns}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <button className="view-stats-btn" onClick={onViewDetails}>
        📈 View all statistics
      </button>
    </div>
  );
};
