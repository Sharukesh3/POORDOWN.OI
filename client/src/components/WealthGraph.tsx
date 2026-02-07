
import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { GameState } from '../types';

interface WealthGraphProps {
  gameState: GameState;
  myPlayerId: string;
}

const WealthGraph: React.FC<WealthGraphProps> = ({ gameState, myPlayerId }) => {
  if (!gameState.players || gameState.players.length === 0) return null;

  // Transform data for Recharts
  // We need an array of objects like: { turn: 0, Player1: 1500, Player2: 1500, ... }
  
  // Find the max history length to know how many data points we have
  const maxHistoryLength = Math.max(...gameState.players.map(p => p.wealthHistory?.length || 0));

  const data: any[] = [];
  for (let i = 0; i < maxHistoryLength; i++) {
    const dataPoint: any = { turn: i };
    gameState.players.forEach(p => {
      // Use the value at index i, or the last known value if history is shorter (shouldn't happen if synced)
      // or 0 if undefined
      const history = p.wealthHistory || [];
      const value = history[i] !== undefined ? history[i] : (history[history.length - 1] || 0);
      dataPoint[p.name] = value;
    });
    data.push(dataPoint);
  }

  // Define colors for players
  // We can use the player's color from the state, or a fallback palette
  const getPlayerColor = (playerId: string) => {
    const player = gameState.players.find(p => p.id === playerId);
    return player?.color || '#8884d8';
  };

  // Recharts needs explicit pixel values for some things, but CSS handles container
  
  return (
    <div className="wealth-graph-container" style={{ width: '100%', height: 400 }}>
      {/* <h3 className="wealth-graph-title">Wealth History</h3> */}
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis 
            dataKey="turn" 
            stroke="#8a8aa3" 
            tick={{ fill: '#8a8aa3', fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: '#8a8aa3', opacity: 0.3 }}
          />
          <YAxis 
            stroke="#8a8aa3" 
            tick={{ fill: '#8a8aa3', fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) => `$${value}`}
          />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: '#1a1a2e', 
              border: '1px solid rgba(255,255,255,0.1)', 
              borderRadius: '8px', 
              color: '#fff',
              boxShadow: '0 5px 15px rgba(0,0,0,0.5)'
            }}
            itemStyle={{ fontSize: '0.9rem', padding: '2px 0' }}
            cursor={{ stroke: 'rgba(255,255,255,0.2)', strokeWidth: 2 }}
          />
          <Legend wrapperStyle={{ paddingTop: '20px', opacity: 0.8 }} />
          {gameState.players.map(player => (
            <Line 
              key={player.id}
              type="monotone" 
              dataKey={player.name} 
              stroke={player.color} 
              strokeWidth={3}
              dot={false}
              activeDot={{ r: 6, strokeWidth: 0, fill: '#fff' }}
              animationDuration={2000}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default WealthGraph;
