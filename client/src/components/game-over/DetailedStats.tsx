import type { GameState } from '../../types';
import WealthGraph from '../WealthGraph';
import './DetailedStats.css';


interface DetailedStatsProps {
  gameState: GameState;
  onClose: () => void;
}

export const DetailedStats: React.FC<DetailedStatsProps> = ({ gameState, onClose }) => {
  const winner = gameState.players.find(p => p.id === gameState.winnerId);
  const duration = gameState.startedAt 
    ? Math.floor((Date.now() - gameState.startedAt) / 1000) 
    : 0;
  
  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  };

  const getMostVisited = () => {
    // Aggregate visits
    const visits: Record<string, number> = {};
    gameState.players.forEach(p => {
      if (p.stats?.tileVisits) {
        Object.entries(p.stats.tileVisits).forEach(([tileId, count]) => {
          visits[tileId] = (visits[tileId] || 0) + count;
        });
      }
    });
    
    // Sort
    const sorted = Object.entries(visits).sort((a,b) => b[1] - a[1]);
    return sorted.length > 0 ? sorted[0] : null; // [tileId, count]
  };

  const mostVisited = getMostVisited();
  // We need tile names, but client might need to lookup from board config if not stored
  // For now assuming tileId is descriptive or we can map it. 
  // Ideally passed board data or resolved names.

  return (
    <div className="detailed-stats-overlay">
      <div className="detailed-stats-modal">
        <div className="stats-header">
            <div className="winner-card">
                <div className="trophy-icon">🏆</div>
                <div>
                    <div className="label">Winner</div>
                    <div className="value">{winner?.name}</div>
                </div>
            </div>
            <button className="close-btn" onClick={onClose}>Back to board</button>
        </div>

        <div className="stats-content">
            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-icon">⏱️</div>
                    <div className="stat-info">
                        <div className="label">Duration</div>
                        <div className="value">{formatDuration(duration)}</div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon">🎲</div>
                    <div className="stat-info">
                        <div className="label">Turns</div>
                        <div className="value">{gameState.totalTurns}</div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon">🤝</div>
                    <div className="stat-info">
                        <div className="label">Total Trades</div>
                        <div className="value">
                            {gameState.players.reduce((acc, p) => acc + (p.stats?.trades || 0), 0)}
                        </div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon">📍</div>
                    <div className="stat-info">
                        <div className="label">Most Visited</div>
                        <div className="value">
                            {(() => {
                                if (!mostVisited) return 'N/A';
                                const tile = gameState.board.find(t => t.id === mostVisited[0]);
                                return tile ? tile.name : mostVisited[0];
                            })()}
                        </div>
                    </div>
                </div>
            </div>

            <div className="graph-section">
                <h3>Net worth over time</h3>
                <WealthGraph gameState={gameState} myPlayerId="" />
            </div>
        </div>
      </div>
    </div>
  );
};
