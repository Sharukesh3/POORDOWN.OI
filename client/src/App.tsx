import React, { useState, useEffect, useRef, useMemo } from 'react';
// import io from 'socket.io-client';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LoginModal } from './components/LoginModal';
import { AdModal } from './components/AdModal';
import { 
  getGuestMaps, 
  saveGuestMap, 
  getUserMaps, 
  saveUserMap,
  type SavedMap 
} from './services/MapStorageService';
import { soundManager } from './services/SoundManager';
import type { 
  GameConfig, 
  RoomInfo, 
  GameState, 
  Tile, 
  ChatMessage,
  TradeOffer // Assuming App uses TradeOffer type? 
} from './types';
import type { CustomBoardConfig } from './CustomBoardTypes';
import { BoardCreator } from './components/BoardCreator';
import { Board } from './components/Board';
import { BankruptcyModal } from './components/BankruptcyModal';
import { TradeModal } from './components/TradeModal';
import { GameOverPanel } from './components/game-over/GameOverPanel';
import './App.css';

// App View State Type
type AppView = 'home' | 'lobby' | 'game' | 'create' | 'rooms' | 'board-creator';

// Initialize Socket
// Initialize Socket
// const socket = io(import.meta.env.PROD ? 'https://api.poordown.backend.sharukesh.tech' : 'http://localhost:3001');
import { socket } from './services/socket';

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
  const { currentUser, isGuest, logout } = useAuth();

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
    reconnectTimeoutSeconds: 60,
    voteKickEnabled: true
  });

  // Helper for flag URLs
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

  // Player appearance colors
  const PLAYER_COLORS = [
    '#e74c3c', '#3498db', '#2ecc71', '#f1c40f', 
    '#9b59b6', '#34495e', '#16a085', '#27ae60', 
    '#2980b9', '#8e44ad', '#2c3e50', '#f39c12'
  ];
  const [selectedColor, setSelectedColor] = useState(PLAYER_COLORS[3]); // Default red
  // Board zoom/expand state - default is square (false), expanded is rectangle (true)
  const [isBoardExpanded, setIsBoardExpanded] = useState(false);
  // Custom boards state
  const [customBoards, setCustomBoards] = useState<CustomBoardConfig[]>([]);

  // Auth & Map Saving State
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showAdModal, setShowAdModal] = useState(false);
  const [pendingSaveConfig, setPendingSaveConfig] = useState<CustomBoardConfig | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // LOGOUT
  const handleLogout = async () => {
    await logout();
    setView('home');
  };

  // HANDLE CREATE CLICK
  const handleCreateClick = () => {
    if (!currentUser) {
      setShowLoginModal(true);
    } else {
      setView('board-creator');
    }
  };

  const saveAndFinish = async (config: CustomBoardConfig, uid: string) => {
      setIsSaving(true);
      try {
          await saveUserMap(uid, config);
          setCustomBoards(prev => [...prev, config]);
          alert("Map saved to your account!");
          setView('home');
      } catch (e) {
          console.error(e);
          alert("Failed to save map to server.");
      }
      setIsSaving(false);
  };

  // HANDLE SAVE REQUEST (From BoardCreator)
  const handleSaveRequest = async (config: CustomBoardConfig) => {
    setPendingSaveConfig(config);

    if (isGuest) {
      // Guest Logic
      const existing = getGuestMaps();
      const isUpdate = existing.some(m => m.id === config.id);
      if (!isUpdate && existing.length >= 1) {
        alert("Guest Limit Reached: You can only create 1 custom map as a guest. Please sign in to create more!");
        return;
      }
      setShowAdModal(true);
    } else if (currentUser) {
      // User Logic
      try {
        const maps = await getUserMaps(currentUser.uid);
        if (maps.length === 0) {
           await saveAndFinish(config, currentUser.uid);
        } else {
           setShowAdModal(true);
        }
      } catch (e) {
        console.error(e);
        alert("Error handling save request");
      }
    }
  };

  const handleAdComplete = async () => {
    setShowAdModal(false);
    if (!pendingSaveConfig) return;

    if (isGuest) {
       const success = saveGuestMap(pendingSaveConfig);
       if (success) {
         alert("Map stored in browser! (Warning: It may be lost if cache is cleared)");
         setCustomBoards(prev => [...prev, pendingSaveConfig]);
         setView('home');
       } else {
         alert("Could not save map. Limit reached?");
       }
    } else if (currentUser) {
       await saveAndFinish(pendingSaveConfig, currentUser.uid);
    }
    setPendingSaveConfig(null);
  };




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
      
      // Check for @mention
      if (myPlayer && msg.text.toLowerCase().includes(`@${myPlayer.name.toLowerCase()}`)) {
          soundManager.play('mention');
      }
    });

    socket.on('chat_reset', () => {
        setChatMessages([]);
    });

    socket.on('kicked', (msg: string) => {
        setGameState(null);
        setView('home');
        localStorage.removeItem('monopoly_roomId');
        localStorage.removeItem('monopoly_playerName');
        setError(msg);
        alert(msg); // Hard alert to ensure they see it
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
      socket.off('chat_reset');
      socket.off('kicked');
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
  const activePlayersCount = gameState?.players.filter(p => !p.isBankrupt && !p.isDisconnected).length || 0;

  // Turn Timer Hook
  const [timeRemaining, setTimeRemaining] = useState<string>('');

  useEffect(() => {
    if (!gameState || !gameState.turnStartTimestamp) {
        setTimeRemaining('');
        return;
    }

    const timer = setInterval(() => {
       const elapsed = Date.now() - (gameState.turnStartTimestamp || 0);
       const totalDuration = 5 * 60 * 1000; // 5 minutes
       const remaining = Math.max(0, totalDuration - elapsed);
       
       const minutes = Math.floor(remaining / 60000);
       const seconds = Math.floor((remaining % 60000) / 1000);
       setTimeRemaining(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
    }, 1000);

    return () => clearInterval(timer);
  }, [gameState?.turnStartTimestamp]);

  // View Routingrack last action log entry to prevent duplicate sounds
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
    setTimeout(() => setIsRolling(false), 1200); // 1.2s single throw duration
  };
  
  const handleBuy = () => socket.emit('buy_property');
  const handleDecline = () => socket.emit('decline_property');
  const handleEndTurn = () => socket.emit('end_turn');
  // Bankruptcy modal state
  const [showBankruptcyModal, setShowBankruptcyModal] = useState(false);

  const handleVoluntaryBankrupt = () => {
    setShowBankruptcyModal(true);
  };
  
  const confirmBankruptcy = () => {
    socket.emit('voluntary_bankrupt');
    setShowBankruptcyModal(false);
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

  // Effect to populate trade data when viewing a trade
  useEffect(() => {
    if (viewingTradeId && gameState) {
      const trade = gameState.trades.find(t => t.id === viewingTradeId);
      if (trade) {
        const amIReceiver = trade.toPlayerId === socket.id;
        if (amIReceiver) {
            // If viewing as Receiver, SWAP the values so "You Give" matches "Request" and "They Offer" matches "Offer"
            setTradeOfferMoney(trade.requestMoney); // I give what they requested
            setTradeRequestMoney(trade.offerMoney); // I get what they offered
            setTradeOfferProps(trade.requestProperties);
            setTradeRequestProps(trade.offerProperties);
            setTradeTargetId(trade.fromPlayerId);
        } else {
            // Normal view (Sender or Spectator)
            setTradeOfferMoney(trade.offerMoney);
            setTradeRequestMoney(trade.requestMoney);
            setTradeOfferProps(trade.offerProperties);
            setTradeRequestProps(trade.requestProperties);
            setTradeTargetId(trade.toPlayerId);
        }
      }
    }
  }, [viewingTradeId, gameState]);

  const [bidAmount, setBidAmount] = useState(0);
  const [auctionTimeLeft, setAuctionTimeLeft] = useState(0);
  
  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [showMentionList, setShowMentionList] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState(0);
  const [isAutoPlay, setIsAutoPlay] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);



  // Scroll to bottom on new message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleChatInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setChatInput(val);

      // Check for @mention trigger
      const lastAtPos = val.lastIndexOf('@');
      if (lastAtPos !== -1) {
          // Check if cursor is right after @ or typing name
          const textAfterAt = val.substring(lastAtPos + 1);
          // If there's a space, assume mention is done or invalid for now (simple logic)
          if (!textAfterAt.includes(' ')) {
              setMentionFilter(textAfterAt);
              setShowMentionList(true);
              setMentionSelectedIndex(0); // Reset selection
              return;
          }
      }
      setShowMentionList(false);
  };

  const insertMention = (playerName: string) => {
      const lastAtPos = chatInput.lastIndexOf('@');
      if (lastAtPos !== -1) {
          const prefix = chatInput.substring(0, lastAtPos);
          const newValue = `${prefix}@${playerName} `;
          setChatInput(newValue);
          setShowMentionList(false);
          chatInputRef.current?.focus();
      }
  };

  const handleChatKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!showMentionList || !gameState) return;

      const filteredPlayers = gameState.players.filter(p => p.name.toLowerCase().startsWith(mentionFilter.toLowerCase()));
      if (filteredPlayers.length === 0) return;

      if (e.key === 'ArrowDown') {
          e.preventDefault();
          setMentionSelectedIndex(prev => (prev + 1) % filteredPlayers.length);
      } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setMentionSelectedIndex(prev => (prev - 1 + filteredPlayers.length) % filteredPlayers.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          insertMention(filteredPlayers[mentionSelectedIndex].name);
      } else if (e.key === 'Escape') {
          setShowMentionList(false);
      }
  };

  const handleSendMessage = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (showMentionList) return; // Prevent sending if list is open (Enter handled by KeyDown)
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



  // Auto Play Logic (Top Level)
  useEffect(() => {
      if (!isAutoPlay || !gameState || !myPlayer || view !== 'game') return;

      // Calculate Derived values locally since we are outside the render scope of 'game' view
      const currentPlayer = gameState.players[gameState.currentPlayerIndex];
      const isMyTurn = myPlayer.id === currentPlayer?.id;
      const currentTile = gameState.board[myPlayer.position];
      
      const showBuyActions = isMyTurn && currentTile && !currentTile.owner && ['PROPERTY', 'RAILROAD', 'UTILITY'].includes(currentTile.type);
      const canAfford = showBuyActions && myPlayer && currentTile ? myPlayer.money >= (currentTile.price || 0) : false;

      // 1. Safety Stops
      const stopAutoPlay = (reason: string) => {
          setIsAutoPlay(false);
          const msg = `Auto-play stopped: ${reason}`;
          console.log(msg);
          setError(msg); // Visual notification
          soundManager.play('pay');
          // Auto-clear error after 3s
          setTimeout(() => setError(''), 3000);
          return;
      };

      if (myPlayer.isJailed) return stopAutoPlay("You are in Jail");
      if (gameState.auction?.isActive) return stopAutoPlay("Auction started");
      if (viewingTradeId) return stopAutoPlay("Trade request active");
      if (myPlayer.money < 0) return stopAutoPlay("Bankrupt/Debt");

      // 2. Automation (My Turn Only)
      if (isMyTurn) {
          const timeoutId = setTimeout(() => {
              if (!isAutoPlay || !gameState || !socket) return;
              
              // ROLL

              // ROLL

              // ROLL
              // We roll if:
              // 1. It's a fresh turn (mustRoll=true, diceRolled=false)
              // 2. We rolled doubles and can roll again (canRollAgain=true), effectively "mustRoll" again.
              // Note: gameState.mustRoll is typically true if we haven't rolled yet. 
              // If we rolled doubles, diceRolled=true but canRollAgain=true.
              // So we check if we CAN roll.
              
              // However, we want to pause after buying before re-rolling.
              // The conditions here run every 1.5s.
              
              if ((gameState.mustRoll || gameState.canRollAgain) && !isRolling && !showBuyActions) {
                  // If we already rolled but can roll again (doubles), we need to check if we just bought something?
                  // No, showBuyActions handles the buying phase.
                  // If showBuyActions is false, and we can roll again, we should roll.
                  handleRoll();
                  return;
              }

              // BUY
              if (showBuyActions) {
                   if (canAfford) {
                       handleBuy();
                   } else {
                       stopAutoPlay("Insufficient funds for property");
                   }
                   return;
              }

              // END TURN
              // Condition: Not needing to roll, not needing to buy, strict check.
              if (!gameState.mustRoll && !showBuyActions && !isRolling && !gameState.canRollAgain) {
                   handleEndTurn();
              }
          }, 1500);
          return () => clearTimeout(timeoutId);
      }
  }, [isAutoPlay, gameState, myPlayer, viewingTradeId, isRolling, view]);

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
          onSave={handleSaveRequest} // Intercept Save
          onSaveAndCreateRoom={(config) => {
              // For now, handle same as save.
              handleSaveRequest(config);
          }}
          onCancel={() => setView('home')}
        />
        {showAdModal && (
            <AdModal 
                isOpen={showAdModal} 
                onComplete={handleAdComplete} 
                message={isGuest ? "Guest Mode: Watch Ad to save your map" : "Watch Ad to create another map"}
            />
        )}
      </div>
    );
  }

  // HOME VIEW
  if (view === 'home') {
      return (
          <div className="home-page">
              <LoginModal 
                  isOpen={showLoginModal} 
                  onClose={() => setShowLoginModal(false)}
                  onLoginSuccess={() => {
                      setShowLoginModal(false);
                      setView('board-creator');
                  }}
              />
              
               <div className="home-content">
                  <div className="dice-logo">🎲</div>
                  <h1 className="home-title">
                    <span className="rich">POOR</span>
                    <span className="up">DOWN</span>
                    <span className="io">.OI</span>
                  </h1>
                  <p className="home-subtitle">Rule the economy</p>
                  
                  {/* New Features Section */}
                  <div className="features-section">
                    <div className="feature-item">
                      <span className="feature-icon">🎨</span>
                      <span className="feature-text">Create Custom Maps</span>
                    </div>
                    <div className="feature-item">
                      <span className="feature-icon">👥</span>
                      <span className="feature-text">Play with 10+ Friends</span>
                    </div>
                  </div>
                  
                  {/* Auth Status */}
                  <div style={{marginBottom: '10px', color: '#fff'}}>
                      {currentUser ? (
                         <span>Signed in as {currentUser.isAnonymous ? 'Guest' : (currentUser.displayName || 'User')} <button onClick={handleLogout} style={{background:'none', border:'none', color:'#e74c3c', cursor:'pointer', marginLeft:'10px'}}>Sign Out</button></span>
                      ) : (
                         <span>Not signed in</span>
                      )}
                  </div>
                  
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
                      onKeyDown={e => e.key === 'Enter' && handlePlay()}
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
                       // Use new handler
                       handleCreateClick();
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

               <div className="toggle-group">
                  <span className="switch-label">Vote to Kick</span>
                  <label className="switch">
                    <input type="checkbox" checked={config.voteKickEnabled} onChange={e => setConfig({...config, voteKickEnabled: e.target.checked})} />
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
                <div style={{display:'flex', flexDirection:'column'}}>
                    <span className="player-name">{p.name} {p.id === socket.id ? '(You)' : ''}</span>
                    {p.isBot && <span style={{fontSize: '0.7rem', color: '#a29bfe'}}>AI BOT</span>}
                </div>
                
                <div style={{marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px'}}>
                    {p.isHost && <span className="host-badge">HOST</span>}
                    {isHost && p.id !== socket.id && (
                        <button 
                            className="kick-btn"
                            onClick={() => socket.emit('kick_player', p.id)}
                            title="Kick Player"
                            style={{
                                background: '#d63031',
                                border: 'none',
                                color: 'white',
                                width: '24px',
                                height: '24px',
                                borderRadius: '50%',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.8rem',
                                padding: 0
                            }}
                        >
                            ✕
                        </button>
                    )}
                </div>
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


        {/* Spectator / Kicked Message */}
        {!myPlayer && (
            <div style={{
                position: 'absolute', 
                top: 80, 
                left: '50%', 
                transform: 'translateX(-50%)', 
                background: 'rgba(0,0,0,0.8)', 
                color: '#fab1a0', 
                padding: '10px 20px', 
                borderRadius: '20px', 
                zIndex: 200,
                border: '1px solid #e17055'
            }}>
                👁️ You are spectating (or have been kicked)
            </div>
        )}

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


        {/* Game Over Screen Removed from Overlay - Now in Sidebar */}


        <div className="sidebar-left">
          {gameState.gameOver ? (
             <GameOverPanel gameState={gameState} onLeave={handleLeaveRoom} />
          ) : (
            <>
              <div className="sidebar-header">
                <span className="logo">POORDOWN.OI</span>
                <span className="room-code">Room: {gameState.id}</span>
              </div>
              <div className="chat-section">
                <div className="chat-title">
                  💬 Chat
                  <div style={{display: 'flex', alignItems: 'center'}}>
                    <button 
                        className={`auto-play-toggle-mini ${isAutoPlay ? 'active' : ''}`}
                        onClick={() => setIsAutoPlay(!isAutoPlay)}
                        title={isAutoPlay ? "Disable Auto Play" : "Enable Auto Play"}
                    >
                        <span className="icon">{isAutoPlay ? '🤖' : '🤖'}</span>
                        <span className="text">{isAutoPlay ? 'Auto ON' : 'Auto Play'}</span>
                    </button>

                    <button 
                        className="board-zoom-toggle-mini" 
                        onClick={() => setIsBoardExpanded(!isBoardExpanded)}
                        title={isBoardExpanded ? "Switch to square board" : "Expand to rectangle board"}
                    >
                        <span className="zoom-icon">{isBoardExpanded ? '⊟' : '⊞'}</span>
                        <span className="zoom-text">{isBoardExpanded ? 'Square' : 'Expand'}</span>
                    </button>
                  </div>
            </div>
            <div className="chat-messages">
              {chatMessages.length === 0 ? (
                <div className="chat-message"><span style={{ color: '#8a8aa3' }}>No messages yet...</span></div>
              ) : (
                chatMessages.map(msg => {
                  const isMentioned = myPlayer && msg.text.toLowerCase().includes(`@${myPlayer.name.toLowerCase()}`);
                  return (
                    <div key={msg.id} className={`chat-message ${isMentioned ? 'mentioned' : ''}`}>
                      <strong style={{ color: msg.color }}>{msg.playerName}: </strong>
                      <span>{msg.text}</span>
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </div>
            
            <form onSubmit={handleSendMessage} style={{display: 'flex', width: '100%', position: 'relative'}}>
              {showMentionList && (
                  <div className="mention-autocomplete-list">
                      {gameState.players
                        .filter(p => p.name.toLowerCase().startsWith(mentionFilter.toLowerCase()))
                        .map((p, index) => (
                          <div 
                            key={p.id} 
                            className={`mention-item ${index === mentionSelectedIndex ? 'selected' : ''}`}
                            onClick={() => insertMention(p.name)}
                            onMouseEnter={() => setMentionSelectedIndex(index)}
                          >
                            <span className="mention-avatar" style={{background: p.color}}>
                                {p.avatar === 'pawn' ? '♟️' : (p.avatar === 'robot' ? '🤖' : (p.avatar || '👤'))}
                            </span>
                            {p.name}
                          </div>
                        ))
                      }
                      {gameState.players.filter(p => p.name.toLowerCase().startsWith(mentionFilter.toLowerCase())).length === 0 && (
                          <div className="mention-item no-match">No players found</div>
                      )}
                  </div>
              )}
              <input 
                ref={chatInputRef}
                type="text" 
                className="chat-input" 
                placeholder="Type a message..." 
                value={chatInput}
                onChange={handleChatInputChange}
                onKeyDown={handleChatKeyDown}
                maxLength={200}
              />
            </form>
            

          </div>
          {gameState.freeParkingPot > 0 && !gameState.config.vacationCash && <div className="free-parking-pot">🚗 Free Parking: ${gameState.freeParkingPot}</div>}
            </>
          )}
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
            timeRemaining={timeRemaining}
            showKickWarning={gameState.gameStarted && !gameState.gameOver && !!timeRemaining && (gameState.kickVotes || []).length > 0}
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



          {/* Bankrupt & Vote Kick Actions */}
          <div className="sidebar-actions" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', gap: '10px'}}>
             {gameState.config.voteKickEnabled && (
                <button
                    className="votekick-btn"
                    disabled={currentPlayer?.id === myPlayer?.id || myPlayer?.isBankrupt}
                    onClick={() => socket.emit('vote_kick')}
                    title={
                        currentPlayer?.id === myPlayer?.id ? "Cannot kick yourself" : 
                        myPlayer?.isBankrupt ? "You are bankrupt" : 
                        `Votekick ${currentPlayer?.avatar} ${currentPlayer?.name}`
                    }
                    style={{
                        background: (gameState.kickVotes || []).includes(socket.id || '') ? 'rgba(231, 76, 60, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                        border: (gameState.kickVotes || []).includes(socket.id || '') ? '1px solid #e74c3c' : '1px solid rgba(255, 255, 255, 0.1)',
                        color: (gameState.kickVotes || []).includes(socket.id || '') ? '#e74c3c' : 'rgba(255, 255, 255, 0.6)',
                        borderRadius: '6px',
                        padding: '4px 8px',
                        cursor: (currentPlayer?.id === myPlayer?.id || myPlayer?.isBankrupt) ? 'not-allowed' : 'pointer', 
                        fontSize: '0.8rem',
                        fontWeight: 500,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        transition: 'all 0.2s',
                        height: 'fit-content',
                        opacity: (currentPlayer?.id === myPlayer?.id || myPlayer?.isBankrupt) ? 0.5 : 1
                    }}
                >
                    <span style={{fontSize: '0.9rem'}}>👤×</span>
                    <span>Votekick</span>
                    {(gameState.kickVotes || []).length > 0 && (
                        <span style={{
                            background: 'rgba(255,255,255,0.1)',
                            padding: '1px 5px',
                            borderRadius: '8px',
                            fontSize: '0.7rem',
                            marginLeft: '2px'
                        }}>
                            {(gameState.kickVotes || []).length}
                        </span>
                    )}
                </button>
            )}

            <button 
              className="bankrupt-btn" 
              onClick={handleVoluntaryBankrupt}
              disabled={myPlayer?.isBankrupt}
              style={{
                  background: 'linear-gradient(135deg, #FF6B6B 0%, #FF8E53 100%)',
                  border: 'none',
                  color: 'white',
                  borderRadius: '6px',
                  padding: '5px 12px',
                  cursor: myPlayer?.isBankrupt ? 'not-allowed' : 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 8px rgba(255, 107, 107, 0.2)',
                  opacity: myPlayer?.isBankrupt ? 0.5 : 1,
                  marginLeft: 'auto', // Pushes to the right if alone
                  height: 'fit-content'
              }}
            >
              <span style={{fontSize: '0.9rem'}}>🚩</span>
              <span>Bankrupt</span>
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
                  style={{
                      cursor: 'pointer', 
                      padding: '10px', 
                      display: 'flex', 
                      justifyContent: 'center', 
                      alignItems: 'center',
                      background: 'rgba(30, 30, 50, 0.6)',
                      border: '1px solid rgba(255,255,255,0.1)'
                  }}
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
                  title={`Trade to ${toPlayer?.name}`}
                >
                   <div className="trade-avatars-mini" style={{gap: '10px'}}>
                      <div className="avatar-small" style={{background: myPlayer?.color, width: '35px', height: '35px', fontSize: '1.2rem'}}>😊</div>
                      <span className="arrow" style={{fontSize: '1.2rem', color: '#aaa'}}>➜</span>
                      <div className="avatar-small" style={{background: toPlayer?.color, width: '35px', height: '35px', fontSize: '1.2rem'}}>�</div>
                   </div>
                </div>
              );
            })}

            {/* All Pending Trades (Visible to everyone) */}
            {gameState.trades.filter(t => t.status === 'PENDING').map(trade => {
                const isViewing = viewingTradeId === trade.id;
                
                // Determine if I am involved
                const amIReceiver = trade.toPlayerId === socket.id;
                const amISender = trade.fromPlayerId === socket.id;

                // Hide the pill if I am the sender (since I already have the detailed "Outgoing Trade" card)
                if (amISender) return null;

                if (isViewing) return (
                    <div key={trade.id} className="trade-offer-card active-view" style={{background: 'rgba(30, 30, 50, 0.95)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '10px', textAlign: 'center'}}>
                         <p style={{margin: 0, fontSize: '0.9rem'}}>👁️ Viewing Trade...</p>
                    </div>
                );
                
                // Simplified Icon-Only Pill
                const fromPlayer = gameState.players.find(p => p.id === trade.fromPlayerId);
                const toPlayer = gameState.players.find(p => p.id === trade.toPlayerId);

                return (
                   <div key={trade.id} className="trade-minimized-pill" 
                       style={{
                           background: 'rgba(30, 30, 50, 0.9)', 
                           border: amIReceiver ? '1px solid #e74c3c' : '1px solid rgba(255,255,255,0.1)', 
                           boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
                           borderRadius: '8px',
                           padding: '10px',
                           display: 'flex',
                           justifyContent: 'center',
                           alignItems: 'center',
                           cursor: 'pointer',
                           marginBottom: '8px',
                           marginTop: '8px'
                       }}
                       onClick={() => {
                           setViewingTradeId(trade.id);
                           setMinimizedTradeIds(prev => prev.filter(id => id !== trade.id)); // Un-minimize
                       }}
                       title={`Trade: ${fromPlayer?.name} -> ${toPlayer?.name}`}
                   >
                        <div className="minimized-avatars" style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                             <div className="avatar-small" style={{width: '35px', height: '35px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', userSelect: 'none', background: fromPlayer?.color, fontSize: '1.2rem'}}>😊</div>
                             <span className="arrow" style={{color: '#888', fontSize: '1.2rem'}}>➜</span>
                             <div className="avatar-small" style={{width: '35px', height: '35px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', userSelect: 'none', background: toPlayer?.color, fontSize: '1.2rem'}}>😊</div>
                        </div>
                   </div>
                );
            })}
          </div>

          {/* My Properties Section */}
          <div className="my-properties-section">
            <h4 className="properties-title">My properties ({myPlayer?.properties.length || 0})</h4>
             <div className="properties-grid" style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
               {[...(myPlayer?.properties || [])]
                 .map(id => gameState.board.find(t => t.id === id))
                 .filter((t): t is Tile => !!t) // Filter valid tiles
                 .sort((a, b) => {
                    // Sort by board index (value/color group order)
                    return gameState.board.indexOf(a) - gameState.board.indexOf(b);
                 })
                 .map(prop => {
                 const groupColor = prop.group ? `var(--group-${prop.group})` : '#ccc';
                 const flagUrl = prop.icon ? getFlagUrl(prop.icon) : null;
                 
                 return (
                   <div 
                     key={prop.id} 
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
                // When closing a viewed trade, minimize it so it doesn't auto-reopen immediately
                setMinimizedTradeIds(prev => [...prev, viewingTradeId]);
                setViewingTradeId(null);
                setIsNegotiating(false);
            } else {
                setShowTradeModal(false);
                setTradeStep('none');
            }
          }}
          myPlayer={(() => {
              if (viewingTradeId && gameState) {
                  const trade = gameState.trades.find(t => t.id === viewingTradeId);
                  if (trade) {
                      const amInvolved = trade.fromPlayerId === socket.id || trade.toPlayerId === socket.id;
                      if (!amInvolved) {
                          // Spectator: Show Sender as "You" (Left side)
                          return gameState.players.find(p => p.id === trade.fromPlayerId) || myPlayer;
                      }
                  }
              }
              return myPlayer;
          })()}
          targetPlayer={(() => {
              if (viewingTradeId && gameState) {
                   const trade = gameState.trades.find(t => t.id === viewingTradeId);
                   if (trade) {
                       const amInvolved = trade.fromPlayerId === socket.id || trade.toPlayerId === socket.id;
                       if (!amInvolved) {
                           // Spectator: Show Recipient as "Target" (Right side)
                           return gameState.players.find(p => p.id === trade.toPlayerId)!;
                       }
                       // If I am involved:
                       // If I am Sender, Target is ToPlayer.
                       // If I am Receiver, Target is FromPlayer (Sender).
                       if (trade.fromPlayerId === socket.id) return gameState.players.find(p => p.id === trade.toPlayerId)!;
                       if (trade.toPlayerId === socket.id) return gameState.players.find(p => p.id === trade.fromPlayerId)!;
                   }
              }
              // Fallback for Create Mode
              return gameState.players.find(p => p.id === tradeTargetId)!;
          })()}
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
          onAccept={
              viewingTradeId && gameState.trades.find(t => t.id === viewingTradeId)?.toPlayerId === socket.id
              ? () => {
                  handleAcceptTrade(viewingTradeId!);
                  setViewingTradeId(null);
                }
              : undefined
          }
          onDecline={
              viewingTradeId && gameState.trades.find(t => t.id === viewingTradeId)?.toPlayerId === socket.id
              ? () => {
                   handleRejectTrade(viewingTradeId!);
                   setViewingTradeId(null);
                }
              : undefined
          }
          onNegotiate={
              viewingTradeId && gameState.trades.find(t => t.id === viewingTradeId)?.toPlayerId === socket.id
              ? () => setIsNegotiating(true)
              : undefined
          }
          isValid={tradeValidity.isValid}
        />
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

        {/* Bankruptcy Modal */}
        <BankruptcyModal 
          isOpen={showBankruptcyModal} 
          onConfirm={confirmBankruptcy} 
          onCancel={() => setShowBankruptcyModal(false)} 
        />
      </div>
    );
  }

  return <div className="home-page"><div className="loading">Loading...</div></div>;
}

// End of App component
export default App;
