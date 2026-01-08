import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { Game } from './game/Game';
import { GameConfig, RoomInfo, ChatMessage, CustomBoardConfig } from './types';

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const games = new Map<string, Game>();

// Generate room ID
function generateRoomId(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Get public rooms list
function getPublicRooms(): RoomInfo[] {
  const rooms: RoomInfo[] = [];
  games.forEach(game => {
    const info = game.getRoomInfo();
    if (!info.isPrivate && !info.gameStarted) {
      rooms.push(info);
    }
  });
  return rooms;
}

// Find game by player
function findGameByPlayer(socketId: string): { roomId: string; game: Game } | null {
  for (const [roomId, game] of games.entries()) {
    if (game.hasPlayer(socketId)) {
      return { roomId, game };
    }
  }
  return null;
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // ============================================
  // ROOM MANAGEMENT
  // ============================================

  socket.on('get_rooms', () => {
    socket.emit('rooms_list', getPublicRooms());
  });

  socket.on('create_room', ({ playerName, roomName, config, customBoardConfig }: { playerName: string; roomName: string; config?: Partial<GameConfig>; customBoardConfig?: CustomBoardConfig }) => {
    console.log('Server received create_room:', { playerName, roomName, config, customBoardConfig: customBoardConfig ? 'yes' : 'no' });
    const roomId = generateRoomId();
    const game = new Game(roomId, roomName || `${playerName}'s Room`, config, customBoardConfig);
    
    try {
      game.addPlayer(socket.id, playerName);
      games.set(roomId, game);
      socket.join(roomId);
      
      socket.emit('room_created', { roomId });
      socket.emit('game_state_update', game.getState());
      io.emit('rooms_list', getPublicRooms());
      
      console.log(`Room ${roomId} created by ${playerName}`);
    } catch (e: any) {
      socket.emit('error', e.message);
    }
  });

  socket.on('join_room', ({ roomId, playerName }: { roomId: string; playerName: string }) => {
    const game = games.get(roomId);
    if (!game) {
      socket.emit('error', 'Room not found');
      return;
    }

    try {
      game.addPlayer(socket.id, playerName);
      socket.join(roomId);
      io.to(roomId).emit('game_state_update', game.getState());
      io.emit('rooms_list', getPublicRooms());
      console.log(`${playerName} joined room ${roomId}`);
    } catch (e: any) {
      socket.emit('error', e.message);
    }
  });

  socket.on('update_config', (newConfig: Partial<GameConfig>) => {
    const result = findGameByPlayer(socket.id);
    if (!result) return socket.emit('error', 'Not in a room');

    try {
      result.game.updateConfig(socket.id, newConfig);
      io.to(result.roomId).emit('game_state_update', result.game.getState());
      io.emit('rooms_list', getPublicRooms());
    } catch (e: any) {
      socket.emit('error', e.message);
    }
  });

  socket.on('start_game', () => {
    const result = findGameByPlayer(socket.id);
    if (!result) return socket.emit('error', 'Not in a room');

    try {
      result.game.startGame(socket.id);
      io.to(result.roomId).emit('game_state_update', result.game.getState());
      io.emit('rooms_list', getPublicRooms());
    } catch (e: any) {
      socket.emit('error', e.message);
    }
  });

  socket.on('leave_room', () => {
    const result = findGameByPlayer(socket.id);
    if (!result) return;

    result.game.removePlayer(socket.id);
    socket.leave(result.roomId);

    if (result.game.getState().players.length === 0) {
      games.delete(result.roomId);
    } else {
      io.to(result.roomId).emit('game_state_update', result.game.getState());
    }
    io.emit('rooms_list', getPublicRooms());
  });

  socket.on('change_color', (color: string) => {
    const result = findGameByPlayer(socket.id);
    if (!result) return socket.emit('error', 'Not in a game');
    
    try {
      result.game.changePlayerColor(socket.id, color);
      io.to(result.roomId).emit('game_state_update', result.game.getState());
    } catch (e: any) {
      socket.emit('error', e.message);
    }
  });

  socket.on('change_avatar', (avatar: string) => {
    const result = findGameByPlayer(socket.id);
    if (!result) return socket.emit('error', 'Not in a game');
    
    try {
      result.game.changePlayerAvatar(socket.id, avatar);
      io.to(result.roomId).emit('game_state_update', result.game.getState());
    } catch (e: any) {
      socket.emit('error', e.message);
    }
  });

  // ============================================
  // GAME ACTIONS
  // ============================================

  socket.on('roll_dice', () => {
    const result = findGameByPlayer(socket.id);
    if (!result) return socket.emit('error', 'Not in a game');
    
    try {
      result.game.rollDice(socket.id);
      io.to(result.roomId).emit('game_state_update', result.game.getState());
    } catch (e: any) {
      socket.emit('error', e.message);
    }
  });

  socket.on('buy_property', () => {
    const result = findGameByPlayer(socket.id);
    if (!result) return socket.emit('error', 'Not in a game');
    
    try {
      result.game.buyProperty(socket.id);
      io.to(result.roomId).emit('game_state_update', result.game.getState());
    } catch (e: any) {
      socket.emit('error', e.message);
    }
  });

  socket.on('end_turn', () => {
    const result = findGameByPlayer(socket.id);
    if (!result) return socket.emit('error', 'Not in a game');
    
    try {
      result.game.endTurn(socket.id);
      io.to(result.roomId).emit('game_state_update', result.game.getState());
    } catch (e: any) {
      socket.emit('error', e.message);
    }
  });

  socket.on('build_house', (tileId: string) => {
    const result = findGameByPlayer(socket.id);
    if (!result) return socket.emit('error', 'Not in a game');
    
    try {
      result.game.buildHouse(socket.id, tileId);
      io.to(result.roomId).emit('game_state_update', result.game.getState());
    } catch (e: any) {
      socket.emit('error', e.message);
    }
  });

  socket.on('sell_house', (tileId: string) => {
    const result = findGameByPlayer(socket.id);
    if (!result) return socket.emit('error', 'Not in a game');
    
    try {
      result.game.sellHouse(socket.id, tileId);
      io.to(result.roomId).emit('game_state_update', result.game.getState());
    } catch (e: any) {
      socket.emit('error', e.message);
    }
  });

  socket.on('sell_property', (tileId: string) => {
    const result = findGameByPlayer(socket.id);
    if (!result) return socket.emit('error', 'Not in a game');

    try {
      result.game.sellProperty(socket.id, tileId);
      io.to(result.roomId).emit('game_state_update', result.game.getState());
    } catch (e: any) {
      socket.emit('error', e.message);
    }
  });

  socket.on('mortgage_property', (tileId: string) => {
    const result = findGameByPlayer(socket.id);
    if (!result) return socket.emit('error', 'Not in a game');
    
    try {
      result.game.mortgageProperty(socket.id, tileId);
      io.to(result.roomId).emit('game_state_update', result.game.getState());
    } catch (e: any) {
      socket.emit('error', e.message);
    }
  });

  socket.on('unmortgage_property', (tileId: string) => {
    const result = findGameByPlayer(socket.id);
    if (!result) return socket.emit('error', 'Not in a game');
    
    try {
      result.game.unmortgageProperty(socket.id, tileId);
      io.to(result.roomId).emit('game_state_update', result.game.getState());
    } catch (e: any) {
      socket.emit('error', e.message);
    }
  });

  socket.on('pay_jail_fine', () => {
    const result = findGameByPlayer(socket.id);
    if (!result) return socket.emit('error', 'Not in a game');
    
    try {
      result.game.payJailFine(socket.id);
      io.to(result.roomId).emit('game_state_update', result.game.getState());
    } catch (e: any) {
      socket.emit('error', e.message);
    }
  });

  socket.on('use_jail_card', () => {
    const result = findGameByPlayer(socket.id);
    if (!result) return socket.emit('error', 'Not in a game');
    
    try {
      result.game.useJailCard(socket.id);
      io.to(result.roomId).emit('game_state_update', result.game.getState());
    } catch (e: any) {
      socket.emit('error', e.message);
    }
  });

  socket.on('voluntary_bankrupt', () => {
    const result = findGameByPlayer(socket.id);
    if (!result) return socket.emit('error', 'Not in a game');
    
    try {
      result.game.voluntaryBankrupt(socket.id);
      io.to(result.roomId).emit('game_state_update', result.game.getState());
    } catch (e: any) {
      socket.emit('error', e.message);
    }
  });

  // ============================================
  // TRADING
  // ============================================

  socket.on('propose_trade', ({ toPlayerId, offerProperties, offerMoney, requestProperties, requestMoney }) => {
    console.log(`[Trade Debug] ${socket.id} proposing trade to ${toPlayerId}`, { offerProperties, offerMoney, requestProperties, requestMoney });
    const result = findGameByPlayer(socket.id);
    if (!result) return socket.emit('error', 'Not in a game');
    
    try {
      result.game.proposeTrade(socket.id, toPlayerId, { offerProperties, offerMoney, requestProperties, requestMoney });
      io.to(result.roomId).emit('game_state_update', result.game.getState());
    } catch (e: any) {
      socket.emit('error', e.message);
    }
  });

  socket.on('accept_trade', (tradeId: string) => {
    const result = findGameByPlayer(socket.id);
    if (!result) return socket.emit('error', 'Not in a game');
    
    try {
      result.game.acceptTrade(socket.id, tradeId);
      io.to(result.roomId).emit('game_state_update', result.game.getState());
    } catch (e: any) {
      socket.emit('error', e.message);
    }
  });

  socket.on('counter_trade', ({ tradeId, offerProperties, offerMoney, requestProperties, requestMoney }) => {
    const result = findGameByPlayer(socket.id);
    if (!result) return socket.emit('error', 'Not in a game');

    try {
      result.game.counterTrade(socket.id, tradeId, { offerProperties, offerMoney, requestProperties, requestMoney });
      io.to(result.roomId).emit('game_state_update', result.game.getState());
    } catch (e: any) {
      socket.emit('error', e.message);
    }
  });

  socket.on('reject_trade', (tradeId: string) => {
    const result = findGameByPlayer(socket.id);
    if (!result) return socket.emit('error', 'Not in a game');
    
    try {
      result.game.rejectTrade(socket.id, tradeId);
      io.to(result.roomId).emit('game_state_update', result.game.getState());
    } catch (e: any) {
      socket.emit('error', e.message);
    }
  });

  socket.on('cancel_trade', (tradeId: string) => {
    const result = findGameByPlayer(socket.id);
    if (!result) return socket.emit('error', 'Not in a game');
    
    try {
      result.game.cancelTrade(socket.id, tradeId);
      io.to(result.roomId).emit('game_state_update', result.game.getState());
    } catch (e: any) {
      socket.emit('error', e.message);
    }
  });

  // ============================================
  // AUCTION
  // ============================================

  socket.on('decline_property', () => {
    const result = findGameByPlayer(socket.id);
    if (!result) return socket.emit('error', 'Not in a game');
    
    try {
      result.game.declineProperty(socket.id);
      io.to(result.roomId).emit('game_state_update', result.game.getState());
    } catch (e: any) {
      socket.emit('error', e.message);
    }
  });

  socket.on('cancel_trade', (tradeId: string) => {
    const result = findGameByPlayer(socket.id);
    if (!result) return socket.emit('error', 'Not in a game');
    
    try {
      result.game.cancelTrade(socket.id, tradeId);
      io.to(result.roomId).emit('game_state_update', result.game.getState());
    } catch (e: any) {
      socket.emit('error', e.message);
    }
  });

  socket.on('place_bid', (amount: number) => {
    const result = findGameByPlayer(socket.id);
    if (!result) return socket.emit('error', 'Not in a game');
    
    try {
      result.game.placeBid(socket.id, amount);
      io.to(result.roomId).emit('game_state_update', result.game.getState());
    } catch (e: any) {
      socket.emit('error', e.message);
    }
  });

  socket.on('complete_auction', () => {
    const result = findGameByPlayer(socket.id);
    if (!result) return socket.emit('error', 'Not in a game');
    
    try {
      result.game.completeAuction();
      io.to(result.roomId).emit('game_state_update', result.game.getState());
    } catch (e: any) {
      socket.emit('error', e.message);
    }
  });

  // ============================================
  // CHAT
  // ============================================

  socket.on('send_message', (text: string) => {
    const result = findGameByPlayer(socket.id);
    if (!result) return; // Silent fail if not in game

    const player = result.game.getState().players.find(p => p.id === socket.id);
    if (!player) return;

    const message: ChatMessage = {
      id: Math.random().toString(36).substring(2, 9),
      playerId: player.id,
      playerName: player.name,
      text: text.trim().substring(0, 200), // Max 200 chars
      timestamp: Date.now(),
      color: player.color
    };

    io.to(result.roomId).emit('new_message', message);
  });

  socket.on('restart_game', () => {
    const result = findGameByPlayer(socket.id);
    if (!result) return socket.emit('error', 'Not in a game');
    
    try {
      result.game.restartGame(socket.id);
      io.to(result.roomId).emit('game_state_update', result.game.getState());
      io.to(result.roomId).emit('new_message', {
        id: Math.random().toString(36),
        playerId: 'SYSTEM',
        playerName: 'SYSTEM',
        text: 'Game was restarted!',
        timestamp: Date.now(),
        color: '#fff'
      });
    } catch (e: any) {
      socket.emit('error', e.message);
    }
  });

  // ============================================
  // RECONNECTION
  // ============================================

  socket.on('rejoin_room', ({ roomId, playerName }: { roomId: string; playerName: string }) => {
    const game = games.get(roomId);
    if (!game) {
      socket.emit('error', 'Room not found');
      return;
    }

    const disconnectedPlayer = game.getDisconnectedPlayer(playerName);
    if (!disconnectedPlayer) {
      socket.emit('error', 'No disconnected player with that name found in this room');
      return;
    }

    const success = game.reconnectPlayer(disconnectedPlayer.id, socket.id);
    if (success) {
      socket.join(roomId);
      socket.emit('rejoin_success', { roomId });
      io.to(roomId).emit('game_state_update', game.getState());
      console.log(`${playerName} reconnected to room ${roomId}`);
    } else {
      socket.emit('error', 'Failed to reconnect');
    }
  });

  // ============================================
  // DISCONNECT
  // ============================================

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    const result = findGameByPlayer(socket.id);
    if (result) {
      // If game is in progress, mark player as disconnected instead of removing
      if (result.game.getState().gameStarted && !result.game.getState().gameOver) {
        result.game.markPlayerDisconnected(socket.id);
        io.to(result.roomId).emit('game_state_update', result.game.getState());
        console.log(`Player marked as disconnected in room ${result.roomId}`);
      } else {
        // Game not started or already over - remove player normally
        result.game.removePlayer(socket.id);
        if (result.game.getState().players.length === 0) {
          games.delete(result.roomId);
        } else {
          io.to(result.roomId).emit('game_state_update', result.game.getState());
        }
        io.emit('rooms_list', getPublicRooms());
      }
    }
  });
});

// Periodic cleanup of expired disconnected players (every 10 seconds)
setInterval(() => {
  games.forEach((game, roomId) => {
    const removedNames = game.cleanupExpiredDisconnectedPlayers();
    if (removedNames.length > 0) {
      console.log(`Cleaned up expired disconnected players in room ${roomId}:`, removedNames);
      if (game.getState().players.length === 0) {
        games.delete(roomId);
        io.emit('rooms_list', getPublicRooms());
      } else {
        io.to(roomId).emit('game_state_update', game.getState());
      }
    }
  });
}, 10000);

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
