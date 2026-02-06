import React, { useState, useEffect, useRef, useMemo } from 'react';
import { soundManager } from './services/SoundManager';
import './App.css';
import { socket } from './services/socket';
import type { GameState, Tile, RoomInfo, GameConfig, ChatMessage } from './types';
import { Board } from './components/Board';
import { BoardCreator } from './components/BoardCreator';
import { TradeModal } from './components/TradeModal';
import type { CustomBoardConfig } from './CustomBoardTypes';

type AppView = 'home' | 'rooms' | 'create' | 'lobby' | 'game' | 'board-creator';

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

// Component for Player Row to handle individual money animation state
const PlayerSidebarRow = ({ player, currentPlayerId, reconnectTimeoutSeconds }: { player: any, currentPlayerId: string | undefined, reconnectTimeoutSeconds?: number }) => {
  const [delta, setDelta] = useState<{val: number, id: number} | null>(null);
  const [remainingTime, setRemainingTime] = useState<number | null>(null);
  const prevMoney = useRef(player.money);

  useEffect(() => {
    // Debug: console.log(`Money update for ${player.name}: ${prevMoney.current} -> ${player.money}`);
    const diff = player.money - prevMoney.current;
    if (diff !== 0) {
      setDelta({ val: diff, id: Date.now() });
      prevMoney.current = player.money;
      setTimeout(() => setDelta(null), 3000); // 3s duration
    }
  }, [player.money]);

  // Countdown timer for disconnected players
  useEffect(() => {
    if (!player.isDisconnected || !player.disconnectedAt || !reconnectTimeoutSeconds) {
      setRemainingTime(null);
      return;
    }

    const updateTimer = () => {
      const elapsed = (Date.now() - player.disconnectedAt) / 1000;
      const remaining = Math.max(0, Math.ceil(reconnectTimeoutSeconds - elapsed));
      setRemainingTime(remaining);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [player.isDisconnected, player.disconnectedAt, reconnectTimeoutSeconds]);

  return (
    <div className={`player-row ${currentPlayerId === player.id ? 'active' : ''} ${player.isBankrupt ? 'bankrupt' : ''} ${player.isDisconnected ? 'disconnected' : ''}`}>
        <div className="player-avatar-circle" style={{ background: player.isDisconnected ? '#555' : player.color, opacity: player.isDisconnected ? 0.5 : 1 }}>
          {/* Status Icons */}
          {player.isDisconnected ? '📡' : (player.isJailed ? '🔒' : (player.vacationTurnsLeft > 0 ? '🏖️' : '😊'))}
        </div>
        <div className="player-details">
          <div className="player-header">
             <span className="player-name-text" style={{ opacity: player.isDisconnected ? 0.5 : 1 }}>{player.name}</span>
             {player.isHost && <span className="crown-icon">👑</span>}
             {player.isDisconnected && <span className="disconnect-badge" title="Player disconnected - waiting to reconnect">⚠️</span>}
          </div>
          {/* Disconnect countdown timer */}
          {player.isDisconnected && remainingTime !== null && (
            <div className="disconnect-timer" style={{ fontSize: '0.7rem', color: remainingTime <= 10 ? '#e74c3c' : '#f39c12' }}>
              ⏱️ {remainingTime}s left
            </div>
          )}
        </div>
        <div className="player-balance" style={{position: 'relative', overflow: 'visible', opacity: player.isDisconnected ? 0.5 : 1}}>
            ${player.money}
            {delta && (
                <span key={delta.id} className={`money-delta ${delta.val > 0 ? 'positive' : 'negative'}`} style={{zIndex: 999}}>
                    {delta.val > 0 ? '+' : ''}{delta.val}
                </span>
            )}
        </div>
    </div>
  );
};

function App() {
  const [isMuted, setIsMuted] = useState(soundManager.getMuteStatus());
  const toggleMute = () => {
      const muted = soundManager.toggleMute();
      setIsMuted(muted);
  };
  const [connected, setConnected] = useState(false);
  const [view, setView] = useState<AppView>('home');
  const [playerName, setPlayerName] = useState('');
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [selectedTile, setSelectedTile] = useState<Tile | null>(null);
  const [error, setError] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [roomName, setRoomName] = useState('');
  const [config, setConfig] = useState<GameConfig>({
    maxPlayers: 4,
    isPrivate: false,
    startingCash: 1500,
    doubleRentOnMonopoly: true,
    vacationCash: true,
    auctionEnabled: true,
    collectRentInJail: true,
    mortgageEnabled: true,
    evenBuild: true,
    randomizeOrder: true,
    mapId: 'default',
    autoAuction: true,
    reconnectTimeoutSeconds: 60
  });

  // Player appearance colors
  const PLAYER_COLORS = [
    '#c8ff00', '#d4a017', '#ff8c00', '#e74c3c',
    '#3498db', '#5f9ea0', '#008b8b', '#2ecc71',
    '#8b6508', '#c850c0', '#ff69b4', '#9b59b6'
  ];
  const [selectedColor, setSelectedColor] = useState(PLAYER_COLORS[3]); // Default red
  // Board zoom/expand state - default is square (false), expanded is rectangle (true)
  const [isBoardExpanded, setIsBoardExpanded] = useState(false);
  // Custom boards state
  const [customBoards, setCustomBoards] = useState<CustomBoardConfig[]>([]);
  // Preset Game Pieces




  useEffect(() => {
    socket.connect();
    socket.on('connect', () => {
      setConnected(true);
      // Auto-reconnect: check if we have a saved session
      const savedRoomId = localStorage.getItem('monopoly_roomId');
      const savedPlayerName = localStorage.getItem('monopoly_playerName');
      if (savedRoomId && savedPlayerName) {
        console.log('Attempting to rejoin room:', savedRoomId);
        socket.emit('rejoin_room', { roomId: savedRoomId, playerName: savedPlayerName });
      }
    });
    socket.on('disconnect', () => setConnected(false));

    // Sound Init Mock - One time listener
    const initSound = () => {
        soundManager.init();
        window.removeEventListener('click', initSound);
        window.removeEventListener('keydown', initSound);
    };
    window.addEventListener('click', initSound);
    window.addEventListener('keydown', initSound);
    
    socket.on('rooms_list', (roomsList: RoomInfo[]) => setRooms(roomsList));
    socket.on('room_created', ({ roomId }) => {
      console.log('Room created:', roomId);
      // Save session for reconnection
      localStorage.setItem('monopoly_roomId', roomId);
      localStorage.setItem('monopoly_playerName', playerName);
    });
    socket.on('game_state_update', (state: GameState) => {
      setGameState(state);
      setView(state.gameStarted ? 'game' : 'lobby');
      // Update saved roomId on successful game state
      localStorage.setItem('monopoly_roomId', state.id);
    });
    socket.on('rejoin_success', ({ roomId }) => {
      console.log('Rejoined room:', roomId);
      // roomId is persisted, game_state_update will handle view change
    });
    socket.on('error', (msg: string) => {
      setError(msg);
      // If reconnect failed, clear session
      if (msg.includes('No disconnected player') || msg.includes('Room not found')) {
        localStorage.removeItem('monopoly_roomId');
        localStorage.removeItem('monopoly_playerName');
      }
      setTimeout(() => setError(''), 3000);
    });
    socket.on('new_message', (msg: ChatMessage) => {
      setChatMessages(prev => [...prev, msg]);
      // Scroll to bottom logic could go here or in a separate useEffect
    });
    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('rooms_list');
      socket.off('room_created');
      socket.off('game_state_update');
      socket.off('rejoin_success');
      socket.off('error');
      socket.off('new_message');
      socket.disconnect();
    };
  }, []);

  const handlePlay = () => {
    if (!playerName.trim()) { setError('Please enter your name'); return; }
    socket.emit('get_rooms');
    setView('rooms');
  };

  const handleCreateRoom = () => {
    console.log('Creating room with config:', config);
    // Find custom board config if a custom mapId is selected
    const customBoardConfig = config.mapId.startsWith('custom_') 
      ? customBoards.find(b => b.id === config.mapId) 
      : undefined;
    console.log('Custom board config:', customBoardConfig ? customBoardConfig.name : 'none');
    socket.emit('create_room', { playerName, roomName: roomName || `${playerName}'s Room`, config, customBoardConfig });
  };

  const handleJoinRoom = (roomId: string) => {
    socket.emit('join_room', { roomId, playerName });
    // Save session for reconnection
    localStorage.setItem('monopoly_roomId', roomId);
    localStorage.setItem('monopoly_playerName', playerName);
  };
  const handleStartGame = () => socket.emit('start_game');
  const handleLeaveRoom = () => { 
    socket.emit('leave_room'); 
    setGameState(null); 
    setView('home'); 
    // Clear session on manual leave
    localStorage.removeItem('monopoly_roomId');
    localStorage.removeItem('monopoly_playerName');
    // Reset trade state
    setTradeTargetId('');
    setTradeOfferMoney(0);
    setTradeRequestMoney(0);
    setTradeOfferProps([]);
    setTradeRequestProps([]);
  };

  const handleJoinByCode = () => {
    if (!joinCode.trim()) { setError('Please enter a room code'); return; }
    handleJoinRoom(joinCode.toUpperCase());
  };

  // Dice animation state
  const [isRolling, setIsRolling] = useState(false);
  
  // Movement animation state
  const [animatingPlayerId, setAnimatingPlayerId] = useState<string | null>(null);
  const [animationPosition, setAnimationPosition] = useState<number | null>(null);
  const [highlightedTile, setHighlightedTile] = useState<number | null>(null);
  const previousPositions = React.useRef<{[key: string]: number}>({});

  // Animate player movement step by step
  const animateMovement = (playerId: string, fromPos: number, toPos: number, boardLength: number) => {
    setAnimatingPlayerId(playerId);
    let currentPos = fromPos;
    const steps: number[] = [];
    
    // Calculate steps (going around the board)
    while (currentPos !== toPos) {
      currentPos = (currentPos + 1) % boardLength;
      steps.push(currentPos);
    }
    
    // Animate through each step (Faster: 80ms)
  steps.forEach((pos, index) => {
    setTimeout(() => {
      setAnimationPosition(pos);
      // Removed setHighlightedTile(pos) to prevent distracting flashing while sliding
    }, index * 80); 
  });
  
  // Clear animation after completion
  setTimeout(() => {
    setAnimatingPlayerId(null);
    setAnimationPosition(null);
    setHighlightedTile(null);
  }, steps.length * 80 + 100);
};

  // Jail animation state
  const [showJailAnimation, setShowJailAnimation] = useState(false);
  const [jailedPlayerName, setJailedPlayerName] = useState('');
  const previousJailState = React.useRef<{[key: string]: boolean}>({});

  // Watch for position changes and trigger animation
  React.useEffect(() => {
    if (!gameState) return;
    
    // Check if the dice are rolling (based on recent log or state)
    // Ideally we'd use a more explicit flag, but for now we sync with the 3D dice animation duration (approx 2.5-3s)
    let delay = 0;
    const latestLog = gameState.actionLog[0] || '';
    if (latestLog.toLowerCase().includes('rolled')) {
       delay = 3000; // Wait 3s for dice animation
    }

    const timer = setTimeout(() => {
      gameState.players.forEach(player => {
        const prevPos = previousPositions.current[player.id];
        const wasJailed = previousJailState.current[player.id];
        
        // Check if player was just sent to jail
        if (!wasJailed && player.isJailed) {
          setJailedPlayerName(player.name);
          setShowJailAnimation(true);
          soundManager.play('jail'); // Play jail sound
          setTimeout(() => setShowJailAnimation(false), 2000);
        }
        
        // Normal movement animation (skip if going to jail)
        if (prevPos !== undefined && prevPos !== player.position && !player.isBankrupt && !player.isJailed) {
          animateMovement(player.id, prevPos, player.position, gameState.board.length);
        }
        
        previousPositions.current[player.id] = player.position;
        previousJailState.current[player.id] = player.isJailed;
      });
    }, delay);

    return () => clearTimeout(timer);
  }, [gameState]);

  // Derived state
  const myPlayer = gameState?.players.find(p => p.id === socket.id);

  // Ref to track last action log entry to prevent duplicate sounds
  const lastLogRef = useRef<string>('');

  useEffect(() => {
    if (!gameState || gameState.actionLog.length === 0) return;

    const latestLog = gameState.actionLog[0];
    
    if (latestLog !== lastLogRef.current) {
        lastLogRef.current = latestLog;
        const lowerLog = latestLog.toLowerCase();
        
        // Check if this is MY roll (avoid double sound as I play it immediately)
        const myName = myPlayer?.name?.toLowerCase();
        const isMyAction = myName && lowerLog.startsWith(myName.toLowerCase());
        
        // For rolls, play immediate on click for feedback, so skip here if it's me
        const isMyRoll = isMyAction && lowerLog.includes('rolled');
        
        if (!isMyRoll && lowerLog.includes('rolled')) soundManager.play('roll');
        
        // For other events, we rely on the log
        if (lowerLog.includes('bought') || lowerLog.includes('collected')) soundManager.play('buy');
        else if (lowerLog.includes('paid') || lowerLog.includes('rent') || lowerLog.includes('tax')) soundManager.play('pay');
        else if (lowerLog.includes('jail') && !lowerLog.includes('rolled')) soundManager.play('jail');
        else if (lowerLog.includes('turn')) soundManager.play('turn_start');
    }
  }, [gameState, myPlayer]);

  // Game actions
  const handleRoll = () => {
    setIsRolling(true);
    soundManager.play('roll'); // Immediate feedback for user
    socket.emit('roll_dice');
    setTimeout(() => setIsRolling(false), 2000); // 2s roll to match the "bell curve" slow-down phase
  };
  
  const handleBuy = () => socket.emit('buy_property');
  const handleDecline = () => socket.emit('decline_property');
  const handleEndTurn = () => socket.emit('end_turn');
  const handleVoluntaryBankrupt = () => {
    if (confirm('Are you sure you want to declare bankruptcy? You will become a spectator.')) {
      socket.emit('voluntary_bankrupt');
    }
  };
  const handlePayJailFine = () => socket.emit('pay_jail_fine');
  const handleUseJailCard = () => socket.emit('use_jail_card');
  const handlePlaceBid = (amount: number) => {
    if (amount > (myPlayer?.money || 0)) return;
    socket.emit('place_bid', amount);
  };
  const handleBuildHouse = (tileId: string) => socket.emit('build_house', tileId);
  const handleSellHouse = (tileId: string) => socket.emit('sell_house', tileId);
  const handleMortgage = (tileId: string) => socket.emit('mortgage_property', tileId);
  const handleUnmortgage = (tileId: string) => socket.emit('unmortgage_property', tileId);
  const handleAcceptTrade = (tradeId: string) => socket.emit('accept_trade', tradeId);
  const handleRejectTrade = (tradeId: string) => socket.emit('reject_trade', tradeId);
  // Unused - keeping for future use
  // const handleSellProperty = (tileId: string) => {
  //   if (window.confirm('Are you sure you want to SELL this property to the bank? You will lose ownership.')) {
  //     socket.emit('sell_property', tileId);
  //   }
  // };

  // Trade modal state
  const [tradeOfferMoney, setTradeOfferMoney] = useState(0);
  const [tradeRequestMoney, setTradeRequestMoney] = useState(0);
  const [tradeOfferProps, setTradeOfferProps] = useState<string[]>([]);
  const [tradeRequestProps, setTradeRequestProps] = useState<string[]>([]);
  const [tradeTargetId, setTradeTargetId] = useState<string>('');
  const [showTradeModal, setShowTradeModal] = useState(false);
  // Trade step: 'none' (not trading), 'selectPlayer' (selecting player), 'proposeTrade' (creating/viewing trade)
  const [tradeStep, setTradeStep] = useState<'none' | 'selectPlayer' | 'proposeTrade'>('none');
  
  // NEW Trade Refactor State
  const [viewingTradeId, setViewingTradeId] = useState<string | null>(null);
  const [viewingOwnTradeId, setViewingOwnTradeId] = useState<string | null>(null); // For sender to view their outgoing trade
  const [isEditingOwnTrade, setIsEditingOwnTrade] = useState(false); // Toggle edit mode for own trade
  const [minimizedTradeIds, setMinimizedTradeIds] = useState<string[]>([]);
  const [isNegotiating, setIsNegotiating] = useState(false);

  // Trade validity check - detects if properties in a trade are no longer owned by expected players
  const tradeValidity = useMemo(() => {
    if (!gameState || !viewingTradeId) return { isValid: true, invalidProperties: [] as string[] };
    
    const trade = gameState.trades.find(t => t.id === viewingTradeId);
    if (!trade) return { isValid: true, invalidProperties: [] as string[] };
    
    const invalidProperties: string[] = [];
    
    // Check offer properties (from the trade sender)
    for (const propId of trade.offerProperties) {
      const tile = gameState.board.find(t => t.id === propId);
      if (!tile || tile.owner !== trade.fromPlayerId) {
        const senderName = gameState.players.find(p => p.id === trade.fromPlayerId)?.name || 'Unknown';
        invalidProperties.push(`${senderName} no longer owns ${tile?.name || propId}`);
      }
    }
    
    // Check request properties (from the trade receiver - me)
    for (const propId of trade.requestProperties) {
      const tile = gameState.board.find(t => t.id === propId);
      if (!tile || tile.owner !== trade.toPlayerId) {
        const receiverName = gameState.players.find(p => p.id === trade.toPlayerId)?.name || 'Unknown';
        invalidProperties.push(`${receiverName} no longer owns ${tile?.name || propId}`);
      }
    }
    
    return { isValid: invalidProperties.length === 0, invalidProperties };
  }, [gameState?.trades, gameState?.board, viewingTradeId]);

  const [bidAmount, setBidAmount] = useState(0);
  const [auctionTimeLeft, setAuctionTimeLeft] = useState(0);
  
  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on new message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleSendMessage = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!chatInput.trim()) return;
    socket.emit('send_message', chatInput);
    setChatInput('');
  };

  // Auction timer
  useEffect(() => {
    if (gameState?.auction?.isActive) {
      const updateTimer = () => {
        const remaining = Math.max(0, Math.floor((gameState.auction!.endTime - Date.now()) / 1000));
        setAuctionTimeLeft(remaining);
        
        // Auto-complete auction when timer reaches 0
        if (remaining === 0) {
          socket.emit('complete_auction');
        }
      };
      updateTimer();
      const interval = setInterval(updateTimer, 1000);
      return () => clearInterval(interval);
    }
  }, [gameState?.auction]);

  // NEW: Auto-Auction Logic
  // If it's my turn, I'm on a property, unowned, and I can't afford it -> Auto Decline (start auction)
  useEffect(() => {
      if (!gameState || !myPlayer) return;
      const currentPlayer = gameState.players[gameState.currentPlayerIndex];
      if (currentPlayer.id !== myPlayer.id) return;
      
      const currentTile = gameState.board[myPlayer.position];
      if (currentTile && 
          ['PROPERTY', 'RAILROAD', 'UTILITY'].includes(currentTile.type) && 
          !currentTile.owner) {
          
          if ((currentTile.price || 0) > myPlayer.money && gameState.config.autoAuction) {
             // User cannot afford it. Auto-trigger auction.
             // We use a small timeout to let the user see where they landed, then auto-decline
             const timer = setTimeout(() => {
                 // Check again to be safe
                 if (gameState.players[gameState.currentPlayerIndex].id === myPlayer.id && !gameState.auction?.isActive) {
                     handleDecline();
                 }
             }, 1500);
             return () => clearTimeout(timer);
          }
      }
  }, [gameState?.currentPlayerIndex, gameState?.board, myPlayer?.position, myPlayer?.money]);
  
  // Auto-open Trade Popup for incoming trades
  useEffect(() => {
    if (!gameState || !myPlayer) return;
    
    // Find any PENDING trade where I am the target (toPlayerId) OR the sender (fromPlayerId - e.g. if I just sent it, I might want to see it, but usually not. Actually prompt says "user a creates trade... user b clicks negotiate... user a sees popup immediately")
    // So if someone counters me, I am now the "toPlayerId" because counterTrade swaps roles! 
    // Wait, my implementation of counterTrade swaps roles. So the person receiving the counter offer IS the toPlayerId.
    // So simply checking for PENDING trades where I am toPlayerId is sufficient for both initial offers and counter offers.
    
    const incomingTrades = gameState.trades.filter(t => t.toPlayerId === myPlayer.id && t.status === 'PENDING');
    
    incomingTrades.forEach(t => {
      // If we are NOT already viewing it AND it is NOT minimized, open it.
      if (viewingTradeId !== t.id && !minimizedTradeIds.includes(t.id)) {
        setViewingTradeId(t.id);
        setIsNegotiating(false); // Default to review mode
        
        // Populate State for Review
        setTradeTargetId(t.fromPlayerId);
        setTradeOfferProps(t.requestProperties);   // They requested these from ME, so I am "offering" them in my view if I accept? NO.
        // Wait. The state variables are `tradeOfferProps` (My stuff) and `tradeRequestProps` (Their stuff).
        // The Trade Object has:
        // `offerProperties`: Stuff FROM the sender (Them)
        // `requestProperties`: Stuff FROM the receiver (Me)
        
        // So:
        // My Offer (tradeOfferProps) = Trade.requestProperties (Stuff they want from me)
        // My Request (tradeRequestProps) = Trade.offerProperties (Stuff they are offering me)
        
        setTradeOfferProps(t.requestProperties);
        setTradeOfferMoney(t.requestMoney);
        setTradeRequestProps(t.offerProperties);
        setTradeRequestMoney(t.offerMoney);
        
        setShowTradeModal(false); // Ensure create modal is closed
      }
    });

    // Also auto-close if trade is no longer pending (accepted/rejected)
    if (viewingTradeId) {
        const activeTrade = gameState.trades.find(t => t.id === viewingTradeId);
        if (!activeTrade || activeTrade.status !== 'PENDING') {
            setViewingTradeId(null);
            setIsNegotiating(false);
            // Clear state? Maybe not necessary if we close the modal.
        }
    }
  }, [gameState?.trades, myPlayer?.id]);
  
  // Reset trade target if they leave the game
  useEffect(() => {
    if (gameState && tradeTargetId) {
      const targetExists = gameState.players.some(p => p.id === tradeTargetId);
      if (!targetExists) setTradeTargetId('');
    }
  }, [gameState, tradeTargetId]);



  const handleSendTrade = () => {
    if (!tradeTargetId) return;
    socket.emit('propose_trade', {
      toPlayerId: tradeTargetId,
      offerProperties: tradeOfferProps,
      offerMoney: tradeOfferMoney,
      requestProperties: tradeRequestProps,
      requestMoney: tradeRequestMoney
    });
    setShowTradeModal(false);
    setTradeStep('none');
    setTradeOfferProps([]);
    setTradeRequestProps([]);
    setTradeOfferMoney(0);
    setTradeRequestMoney(0);
  };

  // BOARD CREATOR VIEW
  if (view === 'board-creator') {
    return (
      <div className="board-creator-page">
        <BoardCreator 
          playerId={socket.id || 'unknown'}
          onSave={(config) => {
            setCustomBoards(prev => [...prev, config]);
            console.log('Saved custom board:', config);
            alert(`Custom board "${config.name}" saved! You can now use it when creating a room.`);
            setView('home');
          }}
          onSaveAndCreateRoom={(config) => {
            setCustomBoards(prev => [...prev, config]);
            // Set the config to use this custom board
            setConfig(prev => ({ ...prev, mapId: config.id }));
            setRoomName(`${playerName}'s ${config.name} Game`);
            console.log('Saved custom board and navigating to create room:', config);
            setView('create');
          }}
          onCancel={() => setView('home')}
        />
      </div>
    );
  }

  // HOME PAGE
  if (view === 'home') {
    return (
      <div className="home-page">
        <div className="home-content">
          <div className="dice-logo">🎲</div>
          <h1 className="home-title">
            <span className="rich">POOR</span>
            <span className="up">DOWN</span>
            <span className="io">.OI</span>
          </h1>
          <p className="home-subtitle">Rule the economy</p>

          <div className="name-section">
            <div className="playing-as">
              <span className="avatar">😊</span>
              <span>Playing as</span>
            </div>
            <input
              className="name-input"
              placeholder="Enter your name"
              value={playerName}
              onChange={e => setPlayerName(e.target.value)}
              maxLength={20}
            />
          </div>

          <button className="play-btn" onClick={handlePlay} disabled={!connected}>
            <span className="play-icon">▶▶</span>
            {connected ? 'Play' : 'Connecting...'}
          </button>

          <div className="home-buttons">
            <button className="secondary-btn" onClick={handlePlay}>👥 All rooms</button>
            <button className="secondary-btn" onClick={() => {
              if (!playerName.trim()) { setError('Please enter your name first'); return; }
              setView('create');
            }}>🔑 Create a private game</button>
            <button className="secondary-btn" onClick={() => {
              if (!playerName.trim()) { setError('Please enter your name first'); return; }
              setView('board-creator');
            }}>🎨 Create custom board</button>
          </div>
        </div>

        <div className="bg-icons">
          <span className="bg-icon" style={{top: '10%', left: '5%'}}>🏠</span>
          <span className="bg-icon" style={{top: '20%', right: '10%'}}>💰</span>
          <span className="bg-icon" style={{top: '60%', left: '8%'}}>✈️</span>
          <span className="bg-icon" style={{top: '70%', right: '5%'}}>❓</span>
        </div>
        
        {/* Sound Toggle */}
        <div 
          className="sound-toggle" 
          onClick={toggleMute} 
          style={{
            position: 'absolute', 
            top: 20, 
            right: 20, 
            cursor: 'pointer', 
            fontSize: '1.5rem', 
            zIndex: 1000,
            background: 'rgba(0,0,0,0.3)',
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px solid rgba(255,255,255,0.2)'
          }}
          title={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted ? '🔇' : '🔊'}
        </div>

        {error && <div className="error-toast">{error}</div>}
      </div>
    );
  }

  // ROOMS BROWSER
  if (view === 'rooms') {
    return (
      <div className="rooms-page">
        <div className="rooms-container">
            <div className="rooms-header">
              <button className="back-btn" onClick={() => setView('home')}>← Back</button>
              <div className="rooms-title"><h2>Available Rooms</h2></div>
              <button className="refresh-btn" onClick={() => socket.emit('get_rooms')}>🔄 Refresh</button>
            </div>

            {/* Join Hero Section */}
            <div className="join-hero-section">
              <span className="join-label">Have a code?</span>
              <div className="join-input-group">
                <input
                  className="join-input"
                  placeholder="Enter Room Code (e.g. ABC1234)"
                  value={joinCode}
                  onChange={e => setJoinCode(e.target.value.toUpperCase())}
                  maxLength={8}
                />
                <button className="join-btn-large" onClick={handleJoinByCode}>JOIN</button>
              </div>
            </div>

            <div className="rooms-grid">
              {/* Card 1: Create New Room */}
              <div className="room-card-base create-room-card" onClick={() => setView('create')}>
                   <div className="create-icon-circle">+</div>
                   <h3>Create New Room</h3>
              </div>

              {/* Public Rooms */}
              {rooms.map(room => (
                  <div key={room.id} className="room-card-base public-room-card" onClick={() => room.playerCount < room.maxPlayers && handleJoinRoom(room.id)}>
                      {room.playerCount < room.maxPlayers && <div className="join-overlay"><span className="join-text-btn">Join Game</span></div>}
                      
                      <div className="room-card-header">
                         <div>
                             <div className="room-name-large">{room.name}</div>
                             <div className="room-host">HOST: {room.hostName.toUpperCase()}</div>
                         </div>
                         <div className="status-badge" style={{
                             background: room.playerCount >= room.maxPlayers ? 'rgba(231, 76, 60, 0.2)' : 'rgba(46, 204, 113, 0.2)',
                             color: room.playerCount >= room.maxPlayers ? '#e74c3c' : '#2ecc71',
                             padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold'
                         }}>
                             {room.playerCount >= room.maxPlayers ? 'FULL' : 'WAITING'}
                         </div>
                      </div>

                      <div className="room-occupancy">
                          <div className="occupancy-labels">
                              <span>Players</span>
                              <span>{room.playerCount} / {room.maxPlayers}</span>
                          </div>
                          <div className="progress-track">
                              <div 
                                className={`progress-fill ${room.playerCount >= room.maxPlayers ? 'full' : ''}`}
                                style={{width: `${(room.playerCount / room.maxPlayers) * 100}%`}}
                              ></div>
                          </div>
                      </div>
                  </div>
              ))}
            </div>
            
            {rooms.length === 0 && (
                <div style={{textAlign: 'center', color: '#8a8aa3', marginTop: 20}}>
                     No public rooms found. Create one!
                </div>
            )}
        </div>
        {error && <div className="error-toast">{error}</div>}
      </div>
    );
  }

  // CREATE ROOM
  if (view === 'create') {
    return (
      <div className="create-page">
        <div className="create-header">
          <button className="back-btn" onClick={() => setView('home')}>← Back</button>
          <h2>Create Room</h2>
        </div>

        <div className="create-form">
          <div className="create-grid">
            <div className="create-col">
              <h3>Room Settings</h3>
              
              <div className="form-group">
                <label>Room Name</label>
                <input value={roomName} onChange={e => setRoomName(e.target.value)} placeholder={`${playerName}'s Room`} />
              </div>

              <div className="form-group">
                <label>Maximum Players</label>
                <select value={config.maxPlayers} onChange={e => setConfig({...config, maxPlayers: parseInt(e.target.value)})}>
                  <option value={2}>2 Players</option>
                  <option value={3}>3 Players</option>
                  <option value={4}>4 Players</option>
                </select>
              </div>

              <div className="form-group">
                <label>Starting Cash</label>
                <select value={config.startingCash} onChange={e => setConfig({...config, startingCash: parseInt(e.target.value)})}>
                  <option value={500}>$500</option>
                  <option value={1000}>$1000</option>
                  <option value={1500}>$1500 (Standard)</option>
                  <option value={2000}>$2000</option>
                  <option value={3000}>$3000</option>
                </select>
              </div>

              <div className="form-group">
                <label>Board Map</label>
                <select value={config.mapId} onChange={e => setConfig({...config, mapId: e.target.value})}>
                  <option value="default">Classic World</option>
                  <option value="small">Speed Round</option>
                  {customBoards.map(board => (
                    <option key={board.id} value={board.id}>🎨 {board.name}</option>
                  ))}
                </select>
                {customBoards.length === 0 && (
                  <p style={{fontSize: '0.8rem', color: '#8a8aa3', marginTop: 6}}>No custom boards yet. <span style={{color: '#6c5ce7', cursor: 'pointer'}} onClick={() => setView('board-creator')}>Create one!</span></p>
                )}
              </div>

              <div className="toggle-group">
                <span className="switch-label">Private Room</span>
                <label className="switch">
                  <input type="checkbox" checked={config.isPrivate} onChange={e => setConfig({...config, isPrivate: e.target.checked})} />
                  <span className="slider"></span>
                </label>
              </div>
            </div>

            <div className="create-col">
              <h3>Gameplay Rules</h3>
              
              <div className="toggle-group">
                <span className="switch-label">x2 Rent on Full Set</span>
                <label className="switch">
                  <input type="checkbox" checked={config.doubleRentOnMonopoly} onChange={e => setConfig({...config, doubleRentOnMonopoly: e.target.checked})} />
                  <span className="slider"></span>
                </label>
              </div>

              <div className="toggle-group">
                <span className="switch-label">Vacation Cash</span>
                <label className="switch">
                  <input type="checkbox" checked={config.vacationCash} onChange={e => setConfig({...config, vacationCash: e.target.checked})} />
                  <span className="slider"></span>
                </label>
              </div>

              <div className="toggle-group">
                 <span className="switch-label">Auto-start Auction if Broke</span>
                 <label className="switch">
                    <input type="checkbox" checked={config.autoAuction} onChange={e => setConfig({...config, autoAuction: e.target.checked})} />
                    <span className="slider"></span>
                 </label>
              </div>

              <div className="toggle-group">
                <span className="switch-label">Auction Skipped Properties</span>
                <label className="switch">
                  <input type="checkbox" checked={config.auctionEnabled} onChange={e => setConfig({...config, auctionEnabled: e.target.checked})} />
                  <span className="slider"></span>
                </label>
              </div>

              <div className="toggle-group">
                 <span className="switch-label">Collect Rent in Jail</span>
                 <label className="switch">
                    <input type="checkbox" checked={config.collectRentInJail} onChange={e => setConfig({...config, collectRentInJail: e.target.checked})} />
                    <span className="slider"></span>
                 </label>
              </div>

              <div className="toggle-group">
                 <span className="switch-label">Allow Mortgage</span>
                 <label className="switch">
                    <input type="checkbox" checked={config.mortgageEnabled} onChange={e => setConfig({...config, mortgageEnabled: e.target.checked})} />
                    <span className="slider"></span>
                 </label>
              </div>

              <div className="toggle-group">
                 <span className="switch-label">Even Build Rule</span>
                 <label className="switch">
                    <input type="checkbox" checked={config.evenBuild} onChange={e => setConfig({...config, evenBuild: e.target.checked})} />
                    <span className="slider"></span>
                 </label>
              </div>

              <div className="toggle-group">
                 <span className="switch-label">Randomize Order</span>
                 <label className="switch">
                    <input type="checkbox" checked={config.randomizeOrder} onChange={e => setConfig({...config, randomizeOrder: e.target.checked})} />
                    <span className="slider"></span>
                 </label>
              </div>
            </div>
          </div>
          <button className="create-btn" onClick={handleCreateRoom}>Create Room</button>
        </div>
        {error && <div className="error-toast">{error}</div>}
      </div>
    );
  }

  // LOBBY
  if (view === 'lobby' && gameState) {
    const myPlayer = gameState.players.find(p => p.id === socket.id);
    const isHost = myPlayer?.isHost;
    const canStart = gameState.players.length >= 2;

    return (
      <div className="lobby-page">
        <div className="lobby-header">
          <button className="back-btn" onClick={handleLeaveRoom}>← Leave</button>
          <h2>{gameState.roomName}</h2>
          <span className="room-code">Room: {gameState.id}</span>
        </div>

        <div className="lobby-content">
          {/* Color Selection */}
          <div className="appearance-section">
            <h3>Select your player appearance:</h3>
            <div className="color-grid">
              {PLAYER_COLORS.map(color => {
                const isTaken = gameState.players.some(p => p.id !== socket.id && p.color === color);
                const isSelected = selectedColor === color;
                return (
                  <div 
                    key={color}
                    className={`color-option ${isSelected ? 'selected' : ''} ${isTaken ? 'taken' : ''}`}
                    style={{ background: color }}
                    onClick={() => {
                      if (!isTaken) {
                        setSelectedColor(color);
                        socket.emit('change_color', color);
                      }
                    }}
                  >
                    {isSelected && <span className="color-eyes">👀</span>}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="lobby-players">
            <h3>Players ({gameState.players.length}/{gameState.config.maxPlayers})</h3>
            {gameState.players.map(p => (
              <div key={p.id} className="lobby-player">
                <div className="player-avatar-lg" style={{background: p.color}}>
                  <span className="avatar-eyes">👀</span>
                </div>
                <span className="player-name">{p.name}</span>
                {p.isHost && <span className="host-badge">HOST</span>}
              </div>
            ))}
            {Array(gameState.config.maxPlayers - gameState.players.length).fill(0).map((_, i) => (
              <div key={`empty-${i}`} className="lobby-player empty">
                <div className="player-avatar-lg">?</div>
                <span className="player-name">Waiting...</span>
              </div>
            ))}
          </div>

          <div className="active-rules-summary" style={{
              background: 'rgba(255,255,255,0.05)', 
              padding: '15px', 
              borderRadius: '8px', 
              marginTop: '20px',
              border: '1px solid rgba(255,255,255,0.1)'
          }}>
            <h3 style={{fontSize: '1rem', marginBottom: '10px', color: '#ffb'}}>📜 Active Rules</h3>
            <div className="rules-grid" style={{
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', 
                gap: '8px', 
                fontSize: '0.8rem'
            }}>
                <div style={{color: gameState.config.doubleRentOnMonopoly ? '#2ecc71' : '#7f8c8d'}}>
                    {gameState.config.doubleRentOnMonopoly ? '✓' : '✗'} x2 Rent on Set
                </div>
                <div style={{color: gameState.config.vacationCash ? '#2ecc71' : '#7f8c8d'}}>
                    {gameState.config.vacationCash ? '✓' : '✗'} Vacation Cash
                </div>
                <div style={{color: gameState.config.autoAuction ? '#2ecc71' : '#7f8c8d'}}>
                    {gameState.config.autoAuction ? '✓' : '✗'} Auto-Auction
                </div>
                <div style={{color: gameState.config.auctionEnabled ? '#2ecc71' : '#7f8c8d'}}>
                    {gameState.config.auctionEnabled ? '✓' : '✗'} Auctions
                </div>
                <div style={{color: gameState.config.collectRentInJail ? '#2ecc71' : '#7f8c8d'}}>
                    {gameState.config.collectRentInJail ? '✓' : '✗'} Rent in Jail
                </div>
                <div style={{color: gameState.config.mortgageEnabled ? '#2ecc71' : '#7f8c8d'}}>
                    {gameState.config.mortgageEnabled ? '✓' : '✗'} Mortgages
                </div>
                 <div style={{color: gameState.config.evenBuild ? '#2ecc71' : '#7f8c8d'}}>
                    {gameState.config.evenBuild ? '✓' : '✗'} Even Build
                </div>
            </div>
          </div>



          <div className="lobby-actions">
            {isHost && (
                <button 
                  className="secondary-btn" 
                  style={{marginBottom: '10px'}}
                  onClick={() => socket.emit('add_bot')}
                  disabled={gameState.gameStarted || gameState.players.length >= gameState.config.maxPlayers}
                >
                  🤖 Add AI Bot
                </button>
            )}

            {isHost ? (
              <button className="start-btn" onClick={handleStartGame} disabled={!canStart}>
                {canStart ? '🚀 Start Game' : 'Waiting for players...'}
              </button>
            ) : (
              <div className="waiting-msg">Waiting for host to start...</div>
            )}
          </div>
        </div>
        {error && <div className="error-toast">{error}</div>}
      </div>
    );
  }

  // GAME VIEW
  if (view === 'game' && gameState) {
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];

    const isMyTurn = myPlayer?.id === currentPlayer?.id;
    const currentTile = myPlayer ? gameState.board[myPlayer.position] : null;
    
    // Check if we need to show buy actions (landed on unowned property)
    // This blocks rolling/ending turn until resolved.
    const showBuyActions = isMyTurn && currentTile && !currentTile.owner && ['PROPERTY', 'RAILROAD', 'UTILITY'].includes(currentTile.type);
    const canAfford = showBuyActions && myPlayer && currentTile ? myPlayer.money >= (currentTile.price || 0) : false;

    return (
      <div className="app-container">
        {error && <div className="error-toast">{error}</div>}

        {/* 3D Dice Rolling Animation - Now rendered in Board component */}

        {/* Jail Animation Overlay */}
        {showJailAnimation && (
          <div className="jail-animation-overlay">
            <div className="jail-animation-content">
              <div className="jail-icon-big">🚔</div>
              <div className="jail-bars">
                <div className="bar"></div>
                <div className="bar"></div>
                <div className="bar"></div>
                <div className="bar"></div>
              </div>
              <div className="jail-text">GO TO JAIL!</div>
              <div className="jailed-player">{jailedPlayerName}</div>
            </div>
          </div>
        )}

        {/* Property panel is now rendered inside Board component tiles */}

        {/* Winner Modal */}
        {gameState.gameOver && (
          <div className="modal-overlay">
            <div className="modal-content winner-modal" style={{background: 'linear-gradient(135deg, #1e272e 0%, #000 100%)', border: '1px solid #ffd700', boxShadow: '0 0 50px rgba(255, 215, 0, 0.3)'}}>
              <h1 style={{color: '#ffd700', textShadow: '0 0 10px rgba(255,215,0,0.5)', fontSize: '3rem', margin: '0 0 20px 0'}}>🏆 Game Over!</h1>
              <h2 style={{color: '#fff', fontSize: '2rem', marginBottom: '40px'}}>
                {gameState.players.find(p => p.id === gameState.winnerId)?.name} Wins!
              </h2>

              <div className="money-graph" style={{display: 'flex', alignItems: 'flex-end', justifyContent: 'center', height: '200px', width: '100%', gap: '20px', marginBottom: '40px', padding: '0 20px'}}>
                {gameState.players.map(p => {
                    const maxMoney = Math.max(...gameState.players.map(pl => pl.money), 1);
                    const height = Math.max(10, (p.money / maxMoney) * 100); 
                    return (
                        <div key={p.id} style={{display: 'flex', flexDirection: 'column', alignItems: 'center', width: '60px'}}>
                            <div style={{color: '#fff', fontWeight: 'bold', marginBottom: '5px'}}>${p.money}</div>
                            <div style={{
                                width: '40px', 
                                height: `${height}%`, 
                                background: p.color, 
                                borderRadius: '4px 4px 0 0',
                                boxShadow: `0 0 10px ${p.color}`,
                                transition: 'height 1s ease-out'
                            }}></div>
                            <div style={{color: '#fff', fontSize: '0.8rem', marginTop: '5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%', textAlign: 'center'}}>{p.name}</div>
                        </div>
                    );
                })}
              </div>

              <div className="winner-actions" style={{display: 'flex', gap: '20px', justifyContent: 'center'}}>
                  <button className="play-btn" onClick={() => socket.emit('restart_game')} style={{width: 'auto', padding: '15px 30px', background: '#00b894'}}>
                    🔄 Play Again
                  </button>
                  <button className="modal-close" onClick={handleLeaveRoom} style={{width: 'auto', padding: '15px 30px', background: '#636e72'}}>
                    Leave Room
                  </button>
              </div>
            </div>
          </div>
        )}

        <div className="sidebar-left">
          <div className="sidebar-header">
            <span className="logo">POORDOWN.OI</span>
            <span className="room-code">Room: {gameState.id}</span>
          </div>
          <div className="chat-section">
            <div className="chat-title">
              💬 Chat
              <button 
                className="board-zoom-toggle-mini" 
                onClick={() => setIsBoardExpanded(!isBoardExpanded)}
                title={isBoardExpanded ? "Switch to square board" : "Expand to rectangle board"}
              >
                <span className="zoom-icon">{isBoardExpanded ? '⊟' : '⊞'}</span>
                <span className="zoom-text">{isBoardExpanded ? 'Square' : 'Expand'}</span>
              </button>
            </div>
            <div className="chat-messages">
              {chatMessages.length === 0 ? (
                <div className="chat-message"><span style={{ color: '#8a8aa3' }}>No messages yet...</span></div>
              ) : (
                chatMessages.map(msg => (
                  <div key={msg.id} className="chat-message">
                    <strong style={{ color: msg.color }}>{msg.playerName}: </strong>
                    <span>{msg.text}</span>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>
            <form onSubmit={handleSendMessage} style={{display: 'flex', width: '100%'}}>
              <input 
                type="text" 
                className="chat-input" 
                placeholder="Type a message..." 
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                maxLength={200}
              />
            </form>
          </div>
          {gameState.freeParkingPot > 0 && !gameState.config.vacationCash && <div className="free-parking-pot">🚗 Free Parking: ${gameState.freeParkingPot}</div>}
        </div>

        <div className="main-stage">
          <Board 
            gameState={gameState} 
            currentPlayerId={socket.id} 
            onTileClick={(tile) => setSelectedTile(tile)} 
            highlightedTile={highlightedTile}
            animatingPlayerId={animatingPlayerId}
            animationPosition={animationPosition}
            onRoll={handleRoll}
            onBuy={handleBuy}
            onDecline={handleDecline}
            onEndTurn={handleEndTurn}
            onPayJailFine={handlePayJailFine}
            onUseJailCard={handleUseJailCard}
            isMyTurn={isMyTurn}
            canBuy={!!showBuyActions} 
            canAfford={canAfford}
            isRolling={isRolling}
            expandedTile={selectedTile}
            onCloseExpanded={() => setSelectedTile(null)}
            onMortgage={handleMortgage}
            onUnmortgage={handleUnmortgage}
            onBuildHouse={handleBuildHouse}
            onSellHouse={handleSellHouse}
            isExpanded={isBoardExpanded}
          />
        </div>

        <div className="sidebar-right">
          {/* Players List */}
          <div className="players-list">
            {gameState.players.map(p => {
              // Logic for money delta
              // We need a way to store previous money for each player. 
              // Since we are inside a map, we can't easily stick hooks here without extracting a component.
              // So I will create a mini-component inline or use a ref map in the parent.
              // For simplicity, let's extract a small helper component defined OUTSIDE App first, 
              // OR just use a specialized component here.
              return <PlayerSidebarRow key={p.id} player={p} currentPlayerId={currentPlayer?.id} reconnectTimeoutSeconds={gameState.config.reconnectTimeoutSeconds} />;
            })}
          </div>

          {/* Bankrupt Button Only */}
          <div className="sidebar-actions">
            <button 
              className="bankrupt-btn" 
              onClick={handleVoluntaryBankrupt}
              disabled={myPlayer?.isBankrupt}
            >
              🚩 Bankrupt
            </button>
          </div>

          {/* Trades Section */}
          <div className="trades-section">
            <div className="trades-header">
              <span className="trades-title">Trades</span>
              <button className="create-trade-btn" onClick={() => {
                setTradeTargetId(''); // Reset target
                setTradeOfferProps([]); // Reset offer
                setTradeRequestProps([]);
                setTradeOfferMoney(0);
                setTradeRequestMoney(0);
                setTradeStep('selectPlayer'); // Open player selection first
              }}>
                <span className="plus-icon">+</span> Create
              </button>
            </div>
            
            {/* Outgoing Trade Offers */}
            {gameState.trades.filter(t => t.fromPlayerId === socket.id && t.status === 'PENDING').map(trade => {
              const toPlayer = gameState.players.find(p => p.id === trade.toPlayerId);
              const isViewingThis = viewingOwnTradeId === trade.id;
              
              return (
                <div 
                  key={trade.id} 
                  className={`trade-offer-card outgoing ${isViewingThis ? 'active-view' : ''}`}
                  style={{cursor: 'pointer'}}
                  onClick={() => {
                    if (!isViewingThis) {
                      setViewingOwnTradeId(trade.id);
                      setIsEditingOwnTrade(false);
                      // Populate state with this trade's data
                      setTradeTargetId(trade.toPlayerId);
                      setTradeOfferProps(trade.offerProperties);
                      setTradeOfferMoney(trade.offerMoney);
                      setTradeRequestProps(trade.requestProperties);
                      setTradeRequestMoney(trade.requestMoney);
                    }
                  }}
                >
                  <div className="outgoing-trade-header">
                    <div className="trade-avatars-mini">
                      <div className="avatar-small" style={{background: myPlayer?.color}}>😊</div>
                      <span className="arrow">➡️</span>
                      <div className="avatar-small" style={{background: toPlayer?.color}}>😊</div>
                    </div>
                    <span className="outgoing-status">⏳ Waiting...</span>
                  </div>
                  <p className="outgoing-player-name">Trade to <strong>{toPlayer?.name}</strong></p>
                  <div className="outgoing-trade-summary">
                    {trade.offerProperties.length > 0 && <span>📦 {trade.offerProperties.length}</span>}
                    {trade.offerMoney > 0 && <span>💵 ${trade.offerMoney}</span>}
                  </div>
                  <button 
                    className="view-trade-btn" 
                    onClick={(e) => { e.stopPropagation(); setViewingOwnTradeId(trade.id); }}
                  >
                    👁️ View Details
                  </button>
                </div>
              );
            })}

            {/* Incoming Trade Offers (Compact/Minimized) */}
            {gameState.trades.filter(t => t.toPlayerId === socket.id && t.status === 'PENDING').map(trade => {
                const isMinimized = minimizedTradeIds.includes(trade.id);
                const isViewing = viewingTradeId === trade.id;
                
                // If it is NOT minimized AND NOT viewing, it should be auto-popped up (so hidden here to avoid duplicate).
                // Wait, if it auto-pops up, `viewingTradeId` IS matched. So `isViewing` is true.
                // So:
                // - Viewing: Show "Viewing..." or Hide? User said "minimize to right side bar".
                // - Minimized: Show Icon.
                
                if (isViewing) return (
                    <div key={trade.id} className="trade-offer-card active-view">
                         <p>👁️ Viewing Trade with <strong>{gameState.players.find(p => p.id === trade.fromPlayerId)?.name}</strong>...</p>
                    </div>
                );
                
                // If minimized (or just waiting in background), show compact bubble
                if (isMinimized) return (
                   <div key={trade.id} className="trade-minimized-pill" onClick={() => {
                       setViewingTradeId(trade.id);
                       setMinimizedTradeIds(prev => prev.filter(id => id !== trade.id)); // Un-minimize
                   }}>
                        <div className="minimized-avatars">
                             <div className="avatar-small" style={{background: gameState.players.find(p => p.id === trade.fromPlayerId)?.color}}>😊</div>
                             <span className="arrow">➡️</span>
                             <div className="avatar-small" style={{background: myPlayer?.color || '#ccc'}}>😊</div>
                        </div>
                        <div className="minimized-label">Trade from {gameState.players.find(p => p.id === trade.fromPlayerId)?.name}</div>
                   </div>
                );
                
                return null;
            })}
          </div>

          {/* My Properties Section */}
          <div className="my-properties-section">
            <h4 className="properties-title">My properties ({myPlayer?.properties.length || 0})</h4>
             <div className="properties-grid" style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
               {myPlayer?.properties.map(propId => {
                 const prop = gameState.board.find(t => t.id === propId);
                 if (!prop) return null;
                 const groupColor = prop.group ? `var(--group-${prop.group})` : '#ccc';
                 const flagUrl = prop.icon ? getFlagUrl(prop.icon) : null;
                 
                 return (
                   <div 
                     key={propId} 
                     className="trade-prop-item" 
                     style={{ 
                         borderColor: 'rgba(255,255,255,0.1)', 
                         borderLeft: `5px solid ${groupColor.replace('var(--group-', '').replace(')', '')}`, // Fallback if var not resolved, but better to use style
                         borderLeftColor: groupColor,
                         cursor: 'pointer',
                         opacity: 1,
                         padding: '6px 10px',
                         marginBottom: '4px'
                     }}
                     onClick={() => setSelectedTile(prop)}
                   >
                      {flagUrl ? (
                        <div className="item-flag" style={{backgroundImage: `url(${flagUrl})`, width: '28px', height: '28px', marginRight: '10px'}}></div>
                      ) : (
                        <div className="item-icon" style={{width: '28px', height: '28px', marginRight: '10px'}}>{prop.icon}</div>
                      )}
                      
                      <div className="item-name" style={{textAlign: 'left', paddingLeft: '0', fontSize: '0.9rem'}}>{prop.name}</div>
                      
                      {prop.houses > 0 && (
                          <div className="item-price" style={{color: '#ffd700', minWidth: 'auto', marginLeft: 'auto', fontSize: '0.8rem'}}>
                            {prop.houses === 5 ? '🏨' : `${prop.houses}🏠`}
                          </div>
                      )}
                   </div>
                 );
               })}
             </div>
          </div>
         </div>

        {/* Player Selection Modal - First step when creating a trade */}
        {tradeStep === 'selectPlayer' && myPlayer && (
          <div className="modal-overlay" onClick={() => setTradeStep('none')}>
            <div className="player-select-modal" onClick={e => e.stopPropagation()}>
              <button className="close-modal-btn" onClick={() => setTradeStep('none')}>×</button>
              <h2 className="trade-title">Select a Player to Trade With</h2>
              <p className="player-select-subtitle">Choose who you want to make a deal with</p>
              
              <div className="player-select-grid">
                {gameState.players.filter(p => p.id !== myPlayer.id && !p.isBankrupt).map(p => {
                  const playerProperties = p.properties.length;
                  return (
                    <div 
                      key={p.id} 
                      className="player-select-card"
                      onClick={() => {
                        setTradeTargetId(p.id);
                        setTradeStep('proposeTrade');
                        setShowTradeModal(true);
                      }}
                    >
                      <div className="player-select-avatar" style={{ background: p.color }}>
                        <span className="avatar-eyes">👀</span>
                      </div>
                      <div className="player-select-name">{p.name}</div>
                      <div className="player-select-stats">
                        <span className="stat">💰 ${p.money}</span>
                        <span className="stat">🏠 {playerProperties} {playerProperties === 1 ? 'property' : 'properties'}</span>
                      </div>
                      <div className="player-select-hint">Click to trade</div>
                    </div>
                  );
                })}
              </div>

              {gameState.players.filter(p => p.id !== myPlayer.id && !p.isBankrupt).length === 0 && (
                <div className="no-players-message">
                  <span className="no-players-icon">😔</span>
                  <p>No players available to trade with</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Trade Modal - Unified (Create & Negotiate) */}
      {/* NEW VISUAL TRADE MODAL - Unified for Creating and Negotiating */}
      {(showTradeModal || viewingTradeId) && tradeTargetId && myPlayer && (
        <TradeModal
          isOpen={true}
          onClose={() => {
            if (viewingTradeId) {
                // If viewing a received trade, closing it usually means ignoring/minimizing it?
                // Or resetting state.
                setViewingTradeId(null);
                setIsNegotiating(false);
            } else {
                setShowTradeModal(false);
                setTradeStep('none');
            }
          }}
          myPlayer={myPlayer}
          targetPlayer={gameState.players.find(p => p.id === tradeTargetId)!}
          board={gameState.board}
          initialOfferMoney={tradeOfferMoney}
          initialOfferProps={tradeOfferProps}
          initialRequestMoney={tradeRequestMoney}
          initialRequestProps={tradeRequestProps}
          isViewing={!!viewingTradeId && !isNegotiating} 
          onSendTrade={(om, op, rm, rp) => {
              if (viewingTradeId) {
                  // This is a COUNTER OFFER
                  socket.emit('counter_trade', {
                    tradeId: viewingTradeId,
                    offerProperties: op,
                    offerMoney: om,
                    requestProperties: rp,
                    requestMoney: rm
                  });
                  setViewingTradeId(null);
                  setIsNegotiating(false);
              } else {
                  // This is a NEW PROPOSAL
                   socket.emit('propose_trade', {
                    toPlayerId: tradeTargetId,
                    offerProperties: op,
                    offerMoney: om,
                    requestProperties: rp,
                    requestMoney: rm
                  });
                  setShowTradeModal(false);
                  setTradeStep('none');
              }
              // Reset local state
              setTradeOfferMoney(0);
              setTradeRequestMoney(0);
              setTradeOfferProps([]);
              setTradeRequestProps([]);
          }}
        />
      )}
      
      {/* Accept/Reject Buttons for Incoming Trade (Overlay on top or separate?) 
          The Modal handles "Viewing", but we need external buttons to Accept/Reject 
          if the modal is in "View Only" mode. 
          Actually, I can build Accept/Reject INTO the TradeModal if I pass them as actions? 
          Or just render a small overlay controls if `viewingTradeId` is active.
      */}
      {viewingTradeId && !isNegotiating && (
          <div className="trade-actions-overlay" style={{
              position: 'fixed', bottom: '10%', left: '50%', transform: 'translateX(-50%)', 
              zIndex: 2100, display: 'flex', gap: '20px'
          }}>
             <button className="accept-trade-btn" style={{padding: '15px 30px', fontSize: '1.2rem', background: '#2ecc71', border: 'none', borderRadius: '8px', cursor: 'pointer', color:'white', fontWeight:'bold', boxShadow: '0 4px 15px rgba(0,0,0,0.3)'}}
                onClick={() => {
                    handleAcceptTrade(viewingTradeId);
                    setViewingTradeId(null);
                }}
                disabled={!tradeValidity.isValid}
             >
                ✓ Accept Trade
             </button>
             <button className="negotiate-trade-btn" style={{padding: '15px 30px', fontSize: '1.2rem', background: '#3498db', border: 'none', borderRadius: '8px', cursor: 'pointer', color:'white', fontWeight:'bold', boxShadow: '0 4px 15px rgba(0,0,0,0.3)'}}
                onClick={() => setIsNegotiating(true)}
             >
                💬 Negotiate
             </button>
             <button className="reject-trade-btn" style={{padding: '15px 30px', fontSize: '1.2rem', background: '#e74c3c', border: 'none', borderRadius: '8px', cursor: 'pointer', color:'white', fontWeight:'bold', boxShadow: '0 4px 15px rgba(0,0,0,0.3)'}}
                onClick={() => {
                    handleRejectTrade(viewingTradeId);
                    setViewingTradeId(null);
                }}
             >
                ✗ Decline
             </button>
          </div>
      )}

        {/* Own Trade View Modal - For sender to view/edit their outgoing trade */}
        {viewingOwnTradeId && myPlayer && (() => {
          const trade = gameState.trades.find(t => t.id === viewingOwnTradeId);
          if (!trade) return null;
          const toPlayer = gameState.players.find(p => p.id === trade.toPlayerId);
          
          return (
            <div className="modal-overlay" onClick={() => setViewingOwnTradeId(null)}>
              <div className="trade-modal-richup" onClick={e => e.stopPropagation()}>
                <button className="close-modal-btn" onClick={() => setViewingOwnTradeId(null)}>×</button>
                
                <h2 className="trade-title">
                  {isEditingOwnTrade ? 'Edit Your Trade' : 'Your Outgoing Trade'}
                </h2>
                
                <div className="trade-status-banner">
                  <span className="status-icon">⏳</span>
                  <span>Waiting for <strong>{toPlayer?.name}</strong> to respond...</span>
                </div>
                
                <div className="trade-players-row">
                  {/* Your Side (Sender) */}
                  <div className="trade-player-side">
                    <div className="trade-player-info">
                      <div className="trade-avatar" style={{ background: myPlayer.color }}>😊</div>
                      <span className="trade-player-name">{myPlayer.name} (You)</span>
                    </div>
                    <div className="money-display">
                      <span className="money-label">Offering:</span>
                      <span className="money-amount">${isEditingOwnTrade ? tradeOfferMoney : trade.offerMoney}</span>
                    </div>
                    {isEditingOwnTrade && (
                      <div className="money-slider-container">
                        <input 
                          type="range" 
                          min="0" 
                          max={myPlayer.money} 
                          value={tradeOfferMoney}
                          onChange={e => setTradeOfferMoney(parseInt(e.target.value))}
                          className="money-slider"
                        />
                      </div>
                    )}
                    <div className="trade-properties">
                      {(isEditingOwnTrade ? tradeOfferProps : trade.offerProperties).map(propId => {
                        const prop = gameState.board.find(t => t.id === propId);
                        const flagUrl = prop?.icon ? getFlagUrl(prop.icon) : null;
                        return (
                          <div 
                            key={propId} 
                            className={`trade-prop-item ${isEditingOwnTrade ? 'selected' : ''}`}
                            style={{ borderColor: `var(--group-${prop?.group})` }}
                            onClick={() => {
                              if (isEditingOwnTrade) {
                                setTradeOfferProps(prev => prev.filter(p => p !== propId));
                              }
                            }}
                          >
                            {flagUrl ? (
                              <div className="item-flag" style={{backgroundImage: `url(${flagUrl})`}}></div>
                            ) : (
                              <div className="item-icon">{prop?.icon}</div>
                            )}
                            <div className="item-name">{prop?.name}</div>
                            <div className="item-price">${prop?.price}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Trade Arrow */}
                  <div className="trade-arrow">↔</div>

                  {/* Their Side (Receiver) */}
                  <div className="trade-player-side">
                    <div className="trade-player-info">
                      <div className="trade-avatar" style={{ background: toPlayer?.color }}>😊</div>
                      <span className="trade-player-name">{toPlayer?.name}</span>
                    </div>
                    <div className="money-display">
                      <span className="money-label">Requesting:</span>
                      <span className="money-amount">${isEditingOwnTrade ? tradeRequestMoney : trade.requestMoney}</span>
                    </div>
                    {isEditingOwnTrade && (
                      <div className="money-slider-container">
                        <input 
                          type="range" 
                          min="0" 
                          max={toPlayer?.money || 0} 
                          value={tradeRequestMoney}
                          onChange={e => setTradeRequestMoney(parseInt(e.target.value))}
                          className="money-slider"
                        />
                      </div>
                    )}
                    <div className="trade-properties">
                      {(isEditingOwnTrade ? tradeRequestProps : trade.requestProperties).map(propId => {
                        const prop = gameState.board.find(t => t.id === propId);
                        const flagUrl = prop?.icon ? getFlagUrl(prop.icon) : null;
                        return (
                          <div 
                            key={propId} 
                            className={`trade-prop-item ${isEditingOwnTrade ? 'selected' : ''}`}
                            style={{ borderColor: `var(--group-${prop?.group})` }}
                            onClick={() => {
                              if (isEditingOwnTrade) {
                                setTradeRequestProps(prev => prev.filter(p => p !== propId));
                              }
                            }}
                          >
                            {flagUrl ? (
                              <div className="item-flag" style={{backgroundImage: `url(${flagUrl})`}}></div>
                            ) : (
                              <div className="item-icon">{prop?.icon}</div>
                            )}
                            <div className="item-name">{prop?.name}</div>
                            <div className="item-price">${prop?.price}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="trade-footer">
                  {!isEditingOwnTrade ? (
                    <>
                      <button 
                        className="create-trade-btn" 
                        style={{flex:1, marginRight:5, background:'#3498db'}} 
                        onClick={() => {
                          setIsEditingOwnTrade(true);
                          // Populate state for editing
                          setTradeOfferProps(trade.offerProperties);
                          setTradeOfferMoney(trade.offerMoney);
                          setTradeRequestProps(trade.requestProperties);
                          setTradeRequestMoney(trade.requestMoney);
                        }}
                      >
                        ✏️ Edit Trade
                      </button>
                      <button 
                        className="reject-trade-btn" 
                        style={{flex:1, marginLeft:5}} 
                        onClick={() => {
                          socket.emit('cancel_trade', trade.id);
                          setViewingOwnTradeId(null);
                        }}
                      >
                        ✗ Cancel Trade
                      </button>
                    </>
                  ) : (
                    <>
                      <button 
                        className="send-trade-btn" 
                        style={{flex:1, marginRight:5}} 
                        onClick={() => {
                          // Cancel old trade and create new one with updated values
                          socket.emit('cancel_trade', trade.id);
                          socket.emit('propose_trade', {
                            toPlayerId: trade.toPlayerId,
                            offerProperties: tradeOfferProps,
                            offerMoney: tradeOfferMoney,
                            requestProperties: tradeRequestProps,
                            requestMoney: tradeRequestMoney
                          });
                          setViewingOwnTradeId(null);
                          setIsEditingOwnTrade(false);
                        }}
                      >
                        ✉️ Update Trade
                      </button>
                      <button 
                        className="reject-trade-btn" 
                        style={{flex:0.5, marginLeft:5, background:'#7f8c8d'}} 
                        onClick={() => setIsEditingOwnTrade(false)}
                      >
                        Back
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Auction Modal */}
        {gameState.auction && gameState.auction.isActive && (
          <div className="modal-overlay">
            <div className="auction-modal">
              <div className="auction-header">
                <h2>🔨 Auction: {gameState.auction.tileName}</h2>
                <div className="auction-timer-bar">
                  <div 
                    className="auction-timer-fill" 
                    style={{ 
                      width: `${(auctionTimeLeft / 10) * 100}%`,
                      background: auctionTimeLeft < 3 ? '#ff4444' : '#4caf50' 
                    }}
                  />
                </div>
              </div>
              
              <div className="auction-body">
                <div className="current-bid-section">
                  <div className="bid-label">Current Highest Bid</div>
                  <div className="bid-amount">${gameState.auction.currentBid}</div>
                  
                  {gameState.auction.highestBidderId ? (
                    <div className="highest-bidder">
                      <div className="player-avatar-circle" style={{ 
                        background: gameState.players.find(p => p.id === gameState.auction!.highestBidderId)?.color,
                        width: '40px', height: '40px', fontSize: '1.5rem'
                      }}>
                        😊
                      </div>
                      <span>{gameState.auction.highestBidderName}</span>
                    </div>
                  ) : (
                    <div className="no-bids">No bids yet</div>
                  )}
                </div>
                
                {myPlayer && !myPlayer.isBankrupt && (
                  <div className="bid-controls">
                    <div className="my-money">Your Money: ${myPlayer.money}</div>
                    
                    {gameState.auction.highestBidderId === myPlayer.id ? (
                      <div className="highest-bidder-status" style={{textAlign: 'center', color: '#4caf50', fontWeight: 'bold', padding: '10px'}}>
                        You are the highest bidder!
                      </div>
                    ) : (
                      <>
                        <div className="quick-bid-buttons">
                          <button 
                            disabled={myPlayer.money < gameState.auction.currentBid + 10}
                            onClick={() => handlePlaceBid(gameState.auction!.currentBid + 10)}
                          >+ $10</button>
                          <button 
                            disabled={myPlayer.money < gameState.auction.currentBid + 50}
                            onClick={() => handlePlaceBid(gameState.auction!.currentBid + 50)}
                          >+ $50</button>
                          <button 
                            disabled={myPlayer.money < gameState.auction.currentBid + 100}
                            onClick={() => handlePlaceBid(gameState.auction!.currentBid + 100)}
                          >+ $100</button>
                        </div>
                        <div className="custom-bid">
                          <input 
                            type="number" 
                            placeholder="Custom amount"
                            value={bidAmount}
                            onChange={e => setBidAmount(parseInt(e.target.value))}
                          />
                          <button 
                            disabled={!bidAmount || bidAmount <= gameState.auction.currentBid || bidAmount > myPlayer.money}
                            onClick={() => handlePlaceBid(bidAmount)}
                          >Bid</button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}


      </div>
    );
  }

  return <div className="home-page"><div className="loading">Loading...</div></div>;
}

// End of App component
export default App;
