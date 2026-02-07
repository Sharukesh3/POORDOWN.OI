import { GameState, Player, Tile, Card, GameConfig, DEFAULT_CONFIG, TradeOffer, Auction, CustomBoardConfig } from '../types';
import { chanceCards, communityChestCards, shuffleDeck } from '../cards';
import { createCustomBoard } from './BoardBuilder';
import { BotLogic } from './BotLogic';

export class Game {
  public id: string;
  public roomName: string;
  private config: GameConfig;
  private players: Player[] = [];
  private currentPlayerIndex: number = 0;
  private board: Tile[];
  private gameStarted: boolean = false;
  private gameOver: boolean = false;
  private winnerId?: string;
  private dice: number[] = [0, 0];
  private doublesCount: number = 0;
  private canRollAgain: boolean = false;
  private mustRoll: boolean = true;
  private startedAt?: number;
  private totalTurns: number = 0;
  private actionLog: string[] = [];
  private chanceDeck: Card[];
  private communityChestDeck: Card[];
  private currentCard?: Card;
  private freeParkingPot: number = 0;
  private propertyGroups: { [group: string]: string[] } = {};
  public onStateChange?: (state: GameState) => void;
  
  // Trading & Auction
  private trades: TradeOffer[] = [];
  private auction?: Auction;
  private awaitingBuyDecision: boolean = false;
  private auctionTimeout?: NodeJS.Timeout;
  private customBoardConfig?: CustomBoardConfig;

  constructor(id: string, roomName: string, config: Partial<GameConfig> = {}, customBoardConfig?: CustomBoardConfig) {
    this.id = id;
    this.roomName = roomName;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.customBoardConfig = customBoardConfig;
    console.log(`Game ${id} initialized with startingCash:`, this.config.startingCash, 'customBoard:', !!customBoardConfig);
    this.board = this.loadMap(this.config.mapId);
    this.chanceDeck = shuffleDeck(chanceCards);
    this.communityChestDeck = shuffleDeck(communityChestCards);
    this.buildPropertyGroups();
    this.log('Room created');
  }

  private notifyStateChange() {
      if (this.onStateChange) {
          this.onStateChange(this.getState());
      }
  }

  private loadMap(mapId: string): Tile[] {
    try {
      // If we have a custom board config and the mapId matches, use it
      if (this.customBoardConfig && mapId.startsWith('custom_')) {
        console.log('Loading custom board:', this.customBoardConfig.name);
        return createCustomBoard(this.customBoardConfig);
      }
      
      // Otherwise load from JSON files
      let tiles: any[];
      if (mapId === 'small') {
        tiles = require('../maps/small.json');
      } else {
        tiles = require('../maps/default.json');
      }
      return tiles.map((t: any) => ({
        ...t,
        houses: 0,
        isMortgaged: false,
        houseCost: t.houseCost || (t.price ? Math.floor(t.price / 2) : undefined)
      }));
    } catch (e) {
      console.error(`Failed to load map ${mapId}`, e);
      return [];
    }
  }

  private buildPropertyGroups() {
    this.board.forEach(tile => {
      if (tile.group) {
        if (!this.propertyGroups[tile.group]) {
          this.propertyGroups[tile.group] = [];
        }
        this.propertyGroups[tile.group].push(tile.id);
      }
    });
  }

  private log(message: string) {
    this.actionLog.unshift(message);
    if (this.actionLog.length > 50) this.actionLog.pop();
  }

  // ============================================
  // ROOM MANAGEMENT
  // ============================================

  getConfig(): GameConfig {
    return this.config;
  }

  updateConfig(playerId: string, newConfig: Partial<GameConfig>) {
    const player = this.players.find(p => p.id === playerId);
    if (!player?.isHost) throw new Error('Only host can change settings');
    if (this.gameStarted) throw new Error('Cannot change settings after game starts');
    
    this.config = { ...this.config, ...newConfig };
    this.log('Settings updated');
  }

  canStart(): boolean {
    return this.players.length >= 2 && !this.gameStarted;
  }

  startGame(playerId: string) {
    const player = this.players.find(p => p.id === playerId);
    if (!player?.isHost) throw new Error('Only host can start the game');
    if (this.players.length < 2) throw new Error('Need at least 2 players');
    if (this.gameStarted) throw new Error('Game already started');

    // Randomize order if enabled
    if (this.config.randomizeOrder) {
      for (let i = this.players.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.players[i], this.players[j]] = [this.players[j], this.players[i]];
      }
    }

    this.startedAt = Date.now();
    this.gameStarted = true;
    this.currentPlayerIndex = 0;
    this.mustRoll = true;
    this.log('Game started!');
    this.log(`${this.players[0].name}'s turn`);

    // Trigger bot if first player is bot
    this.processBotTurn();
  }

  // Snapshot wealth history for graph
  private snapshotWealth() {
    this.players.forEach(p => {
        // If player is bankrupt, record 0 or keep last value? Game logic sets money to 0.
        // We push current money.
        p.wealthHistory.push(p.money);
    });
  }

  addPlayer(playerId: string, name: string) {
    if (this.gameStarted) throw new Error('Game already started');
    if (this.players.length >= this.config.maxPlayers) throw new Error('Room is full');
    if (this.players.some(p => p.id === playerId)) throw new Error('Already in room');

    const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f'];
    const isHost = this.players.length === 0;
    
    const newPlayer: Player = {
      id: playerId,
      name,
      money: this.config.startingCash,
      position: 0,
      color: colors[this.players.length % colors.length],
      avatar: 'pawn', // Default avatar
      properties: [],
      isJailed: false,
      jailTurns: 0,
      isBankrupt: false,
      getOutOfJailCards: 0,
      vacationFund: 0,
      vacationTurnsLeft: 0,
      isHost,
      isReady: false,
      isDisconnected: false,
      disconnectedAt: undefined,
      wealthHistory: [this.config.startingCash],
      stats: {
        doubles: 0,
        trades: 0,
        chatMessages: 0,
        tileVisits: {}
      }
    };
    
    this.players.push(newPlayer);
    this.log(`${name} joined the room`);
  }

  addBot() {
      if (this.gameStarted) throw new Error('Game already started');
      if (this.players.length >= this.config.maxPlayers) throw new Error('Room is full');
      
      const botNumber = this.players.filter(p => p.isBot).length + 1;
      const botId = `bot_${Date.now()}_${Math.floor(Math.random()*1000)}`;
      const name = `Bot ${botNumber}`;
      const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#34495e'];
      const myColor = colors[this.players.length % colors.length];

       const newBot: Player = {
          id: botId,
          name,
          money: this.config.startingCash,
          position: 0,
          color: myColor,
          avatar: 'robot', 
          properties: [],
          isJailed: false,
          jailTurns: 0,
          isBankrupt: false,
          getOutOfJailCards: 0,
          vacationFund: 0,
          vacationTurnsLeft: 0,
          isHost: false, // Bots are never host
          isReady: true,
          isDisconnected: false,
          isBot: true,
          wealthHistory: [this.config.startingCash],
          stats: {
            doubles: 0,
            trades: 0,
            chatMessages: 0,
            tileVisits: {}
          }
        };
        
        this.players.push(newBot);
        this.log(`${name} (AI) was added`);
  }



  removePlayer(playerId: string) {
    const index = this.players.findIndex(p => p.id === playerId);
    if (index === -1) return;

    const player = this.players[index];
    this.log(`${player.name} left the room`);
    this.players.splice(index, 1);

    // Transfer host if needed
    if (player.isHost && this.players.length > 0) {
      this.players[0].isHost = true;
      this.log(`${this.players[0].name} is now the host`);
    }

    this.checkForWinner(); // Check if only 1 player remains
    this.checkForBotOnlyGame();
  }

  // ============================================
  // DISCONNECTION & RECONNECTION
  // ============================================

  markPlayerDisconnected(playerId: string): boolean {
    const player = this.players.find(p => p.id === playerId);
    if (!player) return false;

    player.isDisconnected = true;
    player.disconnectedAt = Date.now();
    this.log(`${player.name} disconnected`);

    // If it's the disconnected player's turn, advance to next player
    const currentPlayer = this.getCurrentPlayer();
    if (this.gameStarted && !this.gameOver && currentPlayer && currentPlayer.id === playerId) {
      this.log(`Skipping ${player.name}'s turn (disconnected)`);
      this.advanceToNextPlayer();
    }

    this.checkForBotOnlyGame();

    return true;
  }

  getDisconnectedPlayer(playerName: string): Player | null {
    return this.players.find(p => p.name === playerName && p.isDisconnected) || null;
  }

  reconnectPlayer(oldPlayerId: string, newPlayerId: string): boolean {
    const player = this.players.find(p => p.id === oldPlayerId && p.isDisconnected);
    if (!player) return false;

    player.id = newPlayerId;
    player.isDisconnected = false;
    player.disconnectedAt = undefined;
    this.log(`${player.name} reconnected!`);
    return true;
  }

  cleanupExpiredDisconnectedPlayers(): string[] {
    const now = Date.now();
    const timeoutMs = this.config.reconnectTimeoutSeconds * 1000;
    const removedNames: string[] = [];

    const expiredPlayers = this.players.filter(
      p => p.isDisconnected && p.disconnectedAt && (now - p.disconnectedAt) >= timeoutMs
    );

    for (const player of expiredPlayers) {
      this.log(`${player.name} timed out and was removed`);
      removedNames.push(player.name);
      this.removePlayer(player.id);
    }
    
    if (expiredPlayers.length > 0) {
        this.checkForBotOnlyGame();
    }

    return removedNames;
  }

  hasPlayer(playerId: string): boolean {
    return this.players.some(p => p.id === playerId);
  }

  changePlayerColor(playerId: string, color: string) {
    if (this.gameStarted) throw new Error('Cannot change color after game starts');
    // Check if color is already taken by another player
    const colorTaken = this.players.some(p => p.id !== playerId && p.color === color);
    if (colorTaken) throw new Error('Color already taken');
    const player = this.getPlayer(playerId);
    player.color = color;
  }

  changePlayerAvatar(playerId: string, avatar: string) {
    if (this.gameStarted) throw new Error('Cannot change avatar after game starts');
    const player = this.getPlayer(playerId);
    player.avatar = avatar;
  }

  private getPlayer(playerId: string): Player {
    const player = this.players.find(p => p.id === playerId);
    if (!player) throw new Error('Player not found');
    return player;
  }

  private getCurrentPlayer(): Player {
    return this.players[this.currentPlayerIndex];
  }

  private getActivePlayers(): Player[] {
    // Only bankrupt players are truly eliminated. Disconnected players are still "in the game"
    return this.players.filter(p => !p.isBankrupt);
  }

  // For turn-taking, we also skip disconnected players
  private getPlayablePlayers(): Player[] {
    return this.players.filter(p => !p.isBankrupt && !p.isDisconnected);
  }

  // SAFETY CHECK: End game if only bots remain
  private checkForBotOnlyGame() {
    if (!this.gameStarted || this.gameOver) return;

    // Active means currenty playing (not bankrupt, not disconnected)
    const activeHumanPlayers = this.players.filter(p => !p.isBankrupt && !p.isDisconnected && !p.isBot);

    // If we have started, and there are NO active humans left...
    if (activeHumanPlayers.length === 0) {
        this.log('🛑 No human players remaining. Safety Shutdown.');
        this.gameOver = true;
        
        // Determine a winner properly so client doesn't freeze
        const activePlayers = this.players.filter(p => !p.isBankrupt && !p.isDisconnected);
        if (activePlayers.length > 0) {
            const winner = activePlayers.sort((a,b) => b.money - a.money)[0];
            this.winnerId = winner.id;
            this.log(`${winner.name} declared winner by default.`);
        }
        
        this.notifyStateChange();
    }
  }

  // STANDARD WIN CHECK: End game if only 1 player remains (Human or Bot)
  private checkForWinner() {
    if (!this.gameStarted || this.gameOver) return;

    // A survivor is someone who is NOT bankrupt and NOT disconnected
    const survivors = this.players.filter(p => !p.isBankrupt && !p.isDisconnected);
    
    if (survivors.length === 1) {
        this.gameOver = true;
        this.winnerId = survivors[0].id;
        this.log(`🏆 ${survivors[0].name} is the Winner!`);
        this.notifyStateChange();
    }
  }

  // ============================================

  // ============================================
  // DICE & MOVEMENT
  // ============================================

  rollDice(playerId: string) {
    if (!this.gameStarted) throw new Error('Game not started');
    if (this.gameOver) throw new Error('Game is over');
    const player = this.getPlayer(playerId);
    if (this.getCurrentPlayer().id !== playerId) throw new Error('Not your turn');
    
    // Debt Check: Cannot roll if in debt
    if (player.money < 0) {
        throw new Error('You are in debt! You must resolve it (mortgage/trade) before rolling.');
    }

    if (!this.mustRoll && !this.canRollAgain) throw new Error('Cannot roll now');

    if (player.isJailed) {
      this.rollInJail(player);
      return;
    }

    const die1 = Math.floor(Math.random() * 6) + 1;
    const die2 = Math.floor(Math.random() * 6) + 1;
    this.dice = [die1, die2];
    const total = die1 + die2;
    const isDoubles = die1 === die2;

    this.log(`${player.name} rolled ${die1} + ${die2} = ${total}`);

    if (isDoubles) {
      this.doublesCount++;
      player.stats.doubles++;
      
      // 3 Doubles Rule
      if (this.doublesCount >= 3) {
        this.log(`${player.name} rolled 3 doubles in a row! Go to Jail!`);
        this.sendToJail(player);
        // Turn ends immediately per user request
        this.advanceToNextPlayer(); 
        return;
      }

      this.log(`${player.name} rolled doubles! Roll again.`);
      this.canRollAgain = true; // Still active for next roll unless debt happens later
    } else {
      this.doublesCount = 0;
      this.canRollAgain = false;
    }

    const oldPosition = player.position;
    player.position = (player.position + total) % this.board.length;

    if (player.position < oldPosition) {
      player.money += 200;
      this.log(`${player.name} passed GO and collected $200`);
    }

    this.mustRoll = false;
    this.handleLanding(player);
    
    // Post-Landing Debt Check for Double Rolling
    // If they rolled doubles but landed on rent and went into debt, they CANNOT roll again.
    if (player.money < 0 && this.canRollAgain) {
        this.canRollAgain = false;
        this.log(`Stopped additional roll because ${player.name} is in debt.`);
    }
  }

  private rollInJail(player: Player) {
    const die1 = Math.floor(Math.random() * 6) + 1;
    const die2 = Math.floor(Math.random() * 6) + 1;
    this.dice = [die1, die2];

    this.log(`${player.name} (in jail) rolled ${die1} + ${die2}`);

    if (die1 === die2) {
      player.isJailed = false;
      player.jailTurns = 0;
      this.log(`${player.name} rolled doubles and is free!`);
      // Standard rule: Move immediately. One chance usually implies they move but turn ends?
      // User said: "one chance if he fails... turn ends".
      // If he SUCCEEDS, standard rule applies (move with result).
      const total = die1 + die2;
      player.position = (player.position + total) % this.board.length;
      this.handleLanding(player);
      // Ensure no further rolls even though it was doubles (often jail doubles don't grant extra roll)
      this.canRollAgain = false;
      this.mustRoll = false;
    } else {
      player.jailTurns++;
      this.log(`${player.name} failed to roll doubles.`);
      if (player.jailTurns >= 3) {
        this.log(`${player.name} must pay $50 to leave jail.`); // Or force pay if they have it
        if (player.money >= 50) {
            player.money -= 50;
            player.isJailed = false;
            player.jailTurns = 0;
            const total = die1 + die2;
            player.position = (player.position + total) % this.board.length;
            this.handleLanding(player);
        } else {
             // Basic fallback if broke in jail
        }
      }
      // Turn ends immediately on fail
      this.advanceToNextPlayer();
    }
  }

  // ============================================
  // LANDING HANDLERS
  // ============================================

  private handleLanding(player: Player) {
    const tile = this.board[player.position];
    // Track stats
    player.stats.tileVisits[tile.id] = (player.stats.tileVisits[tile.id] || 0) + 1;

    this.log(`${player.name} landed on ${tile.name}`);

    switch (tile.type) {
      case 'PROPERTY':
      case 'RAILROAD':
      case 'UTILITY':
        this.handlePropertyLanding(player, tile);
        break;
      case 'GO_TO_JAIL':
        this.sendToJail(player);
        // Immediate turn end as per user request
        this.log(`${player.name}'s turn ends immediately.`);
        this.advanceToNextPlayer();
        break;
      case 'TAX':
        this.handleTax(player, tile);
        break;
      case 'CHANCE':
        this.drawCard(player, 'CHANCE');
        break;
      case 'COMMUNITY_CHEST':
        this.drawCard(player, 'COMMUNITY_CHEST');
        break;
      case 'FREE_PARKING':
        if (this.config.vacationCash) {
          if (player.vacationFund > 0) {
            player.money += player.vacationFund;
            this.log(`${player.name} collected $${player.vacationFund} from their Vacation Fund!`);
            player.vacationFund = 0;
          }
          // User Request: Skip 2 turns when landing on vacation
          player.vacationTurnsLeft = 2;
          this.log(`${player.name} is now on vacation for 2 turns!`);
          this.canRollAgain = false; 
          this.mustRoll = false;
          // Note: Turns will be consumed in advanceToNextPlayer
        }
        break;
    }
  }

  private handlePropertyLanding(player: Player, tile: Tile) {
    if (!tile.owner) {
        // Auto-Auction Rule: if player can't afford and autoAuction is enabled, start auction immediately
        if (tile.price && player.money < tile.price && this.config.autoAuction) {
            this.log(`${player.name} cannot afford ${tile.name}. Auto-starting auction.`);
            this.startAuction(tile);
            return;
        }
    }

    if (tile.owner && tile.owner !== player.id && !tile.isMortgaged) {
      const owner = this.getPlayer(tile.owner);
      
      // Check jail rent rule
      if (owner.isJailed && !this.config.collectRentInJail) {
        this.log(`${owner.name} is in jail - no rent collected`);
        return;
      }

      const rent = this.calculateRent(tile, owner);
      this.payRent(player, owner, rent, tile.name);
    }
  }

  private calculateRent(tile: Tile, owner: Player): number {
    if (tile.isMortgaged) return 0;

    if (tile.type === 'RAILROAD') {
      const railroads = this.board.filter(t => t.type === 'RAILROAD' && t.owner === owner.id);
      return 25 * Math.pow(2, railroads.length - 1);
    }

    if (tile.type === 'UTILITY') {
      const utilities = this.board.filter(t => t.type === 'UTILITY' && t.owner === owner.id);
      const diceTotal = this.dice[0] + this.dice[1];
      return utilities.length === 1 ? diceTotal * 4 : diceTotal * 10;
    }

    if (!tile.rent) return 0;

    if (tile.houses === 0) {
      if (this.config.doubleRentOnMonopoly && this.hasMonopoly(owner.id, tile.group!)) {
        return tile.rent[0] * 2;
      }
      return tile.rent[0];
    }

    return tile.rent[Math.min(tile.houses, tile.rent.length - 1)];
  }

  private payRent(payer: Player, owner: Player, amount: number, propertyName: string) {
    // Debt Update: Always pay full amount, allowing negative balance.
    // User cannot end turn until resolved.
    payer.money -= amount;
    owner.money += amount;
    this.log(`${payer.name} paid $${amount} rent to ${owner.name}`);
    
    if (payer.money < 0) {
        this.log(`${payer.name} is in debt! ($${payer.money})`);
    }
  }

  private handleTax(player: Player, tile: Tile) {
    let taxAmount = 0;
    let taxDescription = '';

    if (tile.id === 'luxury_tax') {
      // Flat $75 for Luxury Tax
      taxAmount = 75;
      taxDescription = 'Luxury Tax ($75)';
    } else {
      // Progressive tax brackets based on player's wealth (Income Tax)
      let taxRate: number;
      let bracketName: string;
      
      if (player.money < 500) {
        taxRate = 0.05; // 5% for low wealth
        bracketName = '5%';
      } else if (player.money < 1000) {
        taxRate = 0.10; // 10% for medium wealth
        bracketName = '10%';
      } else if (player.money < 2000) {
        taxRate = 0.15; // 15% for high wealth  
        bracketName = '15%';
      } else {
        taxRate = 0.20; // 20% for very high wealth
        bracketName = '20%';
      }
      
      const calculatedTax = Math.floor(player.money * taxRate);
      const minTax = 50; // Minimum tax
      taxAmount = Math.max(calculatedTax, minTax);
      taxDescription = `Income Tax (${bracketName} bracket)`;
    }
    
    // Apply tax (Allow negative balance)
    player.money -= taxAmount;
    if (this.config.vacationCash) {
       player.vacationFund += taxAmount;
    }
    this.log(`${player.name} paid $${taxAmount} - ${taxDescription}`);
    
    if (player.money < 0) {
        this.log(`${player.name} is in debt! ($${player.money})`);
    }
  }

  // ============================================
  // CARDS
  // ============================================

  private drawCard(player: Player, type: 'CHANCE' | 'COMMUNITY_CHEST') {
    const deck = type === 'CHANCE' ? this.chanceDeck : this.communityChestDeck;
    const card = deck.shift();
    if (!card) return;

    this.currentCard = card;
    this.log(`${player.name} drew: "${card.description}"`);
    this.executeCard(player, card);

    if (card.action !== 'GET_OUT_OF_JAIL') {
      deck.push(card);
    }
  }

  private executeCard(player: Player, card: Card) {
    switch (card.action) {
      case 'MONEY':
        player.money += card.value || 0;
        break;
      case 'MOVE':
        player.position = (player.position + (card.value || 0) + this.board.length) % this.board.length;
        this.handleLanding(player);
        break;
      case 'MOVE_TO':
        const oldPos = player.position;
        player.position = card.destination || 0;
        if (card.destination !== undefined && card.destination < oldPos) {
          player.money += 200;
          this.log(`${player.name} passed GO and collected $200`);
        }
        if (card.value) player.money += card.value;
        this.handleLanding(player);
        break;
      case 'JAIL':
        this.sendToJail(player);
        this.advanceToNextPlayer();
        break;
      case 'GET_OUT_OF_JAIL':
        player.getOutOfJailCards++;
        break;
      case 'COLLECT_FROM_ALL':
        const collectAmount = card.value || 0;
        this.getActivePlayers().forEach(p => {
          if (p.id !== player.id) {
            const paid = Math.min(p.money, collectAmount);
            p.money -= paid;
            player.money += paid;
          }
        });
        break;
      case 'PAY_ALL':
        const payAmount = card.value || 0;
        const others = this.getActivePlayers().filter(p => p.id !== player.id);
        const totalPay = payAmount * others.length;
        if (player.money >= totalPay) {
          player.money -= totalPay;
          others.forEach(p => p.money += payAmount);
        }
        break;
      case 'REPAIRS':
        const perHouse = card.value || 25;
        const perHotel = perHouse * 4;
        let repairCost = 0;
        this.board.forEach(t => {
          if (t.owner === player.id) {
            if (t.houses === 5) repairCost += perHotel;
            else repairCost += t.houses * perHouse;
          }
        });
        player.money -= repairCost;
        this.log(`${player.name} paid $${repairCost} for repairs`);
        break;
    }
  }

  // ============================================
  // JAIL
  // ============================================

  private sendToJail(player: Player) {
    const jailIndex = this.board.findIndex(t => t.type === 'JAIL');
    player.position = jailIndex >= 0 ? jailIndex : 10;
    player.isJailed = true;
    player.jailTurns = 0;
    this.doublesCount = 0;
    this.canRollAgain = false;
    this.mustRoll = false;
    this.log(`${player.name} was sent to Jail!`);
  }

  payJailFine(playerId: string) {
    const player = this.getPlayer(playerId);
    if (!player.isJailed) throw new Error('Not in jail');
    if (player.money < 50) throw new Error('Not enough money');

    player.money -= 50;
    player.isJailed = false;
    player.jailTurns = 0;
    this.log(`${player.name} paid $50 to leave jail`);
    // User Request: Turn should end immediately
    this.advanceToNextPlayer();
  }

  useJailCard(playerId: string) {
    const player = this.getPlayer(playerId);
    if (!player.isJailed) throw new Error('Not in jail');
    if (player.getOutOfJailCards < 1) throw new Error('No cards');

    player.getOutOfJailCards--;
    player.isJailed = false;
    player.jailTurns = 0;
    this.log(`${player.name} used a Get Out of Jail Free card`);
  }

  // ============================================
  // PROPERTY ACTIONS
  // ============================================

  buyProperty(playerId: string) {
    const player = this.getPlayer(playerId);
    if (this.getCurrentPlayer().id !== playerId) throw new Error('Not your turn');

    const tile = this.board[player.position];
    if (!['PROPERTY', 'RAILROAD', 'UTILITY'].includes(tile.type)) {
      throw new Error('Cannot buy this space');
    }
    if (tile.owner) throw new Error('Already owned');
    if (!tile.price || player.money < tile.price) throw new Error('Not enough money');

    player.money -= tile.price;
    tile.owner = playerId;
    player.properties.push(tile.id);
    this.log(`${player.name} bought ${tile.name} for $${tile.price}`);
  }

  buildHouse(playerId: string, tileId: string) {
    const player = this.getPlayer(playerId);
    const tile = this.board.find(t => t.id === tileId);
    if (!tile) throw new Error('Tile not found');
    if (tile.owner !== playerId) throw new Error('Not yours');
    if (tile.type !== 'PROPERTY') throw new Error('Not a property');
    if (!this.hasMonopoly(playerId, tile.group!)) throw new Error('Need monopoly');
    if (tile.houses >= 5) throw new Error('Max buildings');
    if (tile.isMortgaged) throw new Error('Mortgaged');

    const cost = tile.houseCost || 100;
    if (player.money < cost) throw new Error('Not enough money');

    if (this.config.evenBuild) {
      const groupTiles = this.board.filter(t => t.group === tile.group);
      const minHouses = Math.min(...groupTiles.map(t => t.houses));
      if (tile.houses > minHouses) throw new Error('Build evenly');
    }

    player.money -= cost;
    tile.houses++;
    this.log(`${player.name} built on ${tile.name}`);
  }

  sellHouse(playerId: string, tileId: string) {
    const player = this.getPlayer(playerId);
    const tile = this.board.find(t => t.id === tileId);
    if (!tile) throw new Error('Tile not found');
    if (tile.owner !== playerId) throw new Error('Not yours');
    if (tile.houses <= 0) throw new Error('No buildings');

    if (this.config.evenBuild) {
      const groupTiles = this.board.filter(t => t.group === tile.group);
      const maxHouses = Math.max(...groupTiles.map(t => t.houses));
      if (tile.houses < maxHouses) throw new Error('Sell evenly');
    }

    const refund = Math.floor((tile.houseCost || 100) / 2);
    player.money += refund;
    tile.houses--;
    this.log(`${player.name} sold building on ${tile.name}`);
  }

  mortgageProperty(playerId: string, tileId: string) {
    if (!this.config.mortgageEnabled) throw new Error('Mortgages disabled');
    
    const player = this.getPlayer(playerId);
    const tile = this.board.find(t => t.id === tileId);
    if (!tile) throw new Error('Tile not found');
    if (tile.owner !== playerId) throw new Error('Not yours');
    if (tile.isMortgaged) throw new Error('Already mortgaged');
    if (tile.houses > 0) throw new Error('Sell buildings first');

    const value = Math.floor((tile.price || 0) / 2);
    player.money += value;
    tile.isMortgaged = true;
    this.log(`${player.name} mortgaged ${tile.name} for $${value}`);
  }

  sellProperty(playerId: string, tileId: string) {
    const player = this.getPlayer(playerId);
    const tile = this.board.find(t => t.id === tileId);
    if (!tile) throw new Error('Tile not found');
    if (tile.owner !== playerId) throw new Error('Not yours');
    if (tile.houses > 0) throw new Error('Must sell houses first');
    
    // User gets original price if NOT mortgaged. If mortgaged, nothing (already got 50%).
    const refund = tile.isMortgaged ? 0 : (tile.price || 0);
    player.money += refund;
    
    tile.owner = undefined;
    tile.isMortgaged = false;
    player.properties = player.properties.filter(id => id !== tileId);
    
    this.log(`${player.name} sold ${tile.name} to bank for $${refund}`);
  }

  unmortgageProperty(playerId: string, tileId: string) {
    const player = this.getPlayer(playerId);
    const tile = this.board.find(t => t.id === tileId);
    if (!tile) throw new Error('Tile not found');
    if (tile.owner !== playerId) throw new Error('Not yours');
    if (!tile.isMortgaged) throw new Error('Not mortgaged');

    const cost = Math.floor((tile.price || 0) * 0.55);
    if (player.money < cost) throw new Error('Not enough money');

    player.money -= cost;
    tile.isMortgaged = false;
    this.log(`${player.name} unmortgaged ${tile.name}`);
  }

  private hasMonopoly(playerId: string, group: string): boolean {
    const groupTileIds = this.propertyGroups[group];
    if (!groupTileIds) return false;
    return groupTileIds.every(id => {
      const tile = this.board.find(t => t.id === id);
      return tile && tile.owner === playerId;
    });
  }

  // ============================================
  // TURN MANAGEMENT
  // ============================================

  endTurn(playerId: string) {
    if (this.getCurrentPlayer().id !== playerId) throw new Error('Not your turn');
    if (this.mustRoll) throw new Error('Must roll first');
    if (this.canRollAgain) throw new Error('Must roll again (doubles)');
    
    // Check for debt
    const player = this.getPlayer(playerId);
    if (player.money < 0) throw new Error(`You are in debt ($${player.money}). Sell properties or trade to resolve it!`);

    this.currentCard = undefined;
    this.advanceToNextPlayer();
  }

  private advanceToNextPlayer() {
    // Snapshot wealth at the end of the previous turn (before moving to next)
    this.snapshotWealth();
    this.totalTurns++;

    this.doublesCount = 0;
    this.canRollAgain = false;
    this.mustRoll = true;

    // Check if there are any active players that can take a turn
    const playablePlayers = this.players.filter(p => !p.isBankrupt && !p.isDisconnected);
    if (playablePlayers.length === 0) {
      // All players are either bankrupt or disconnected - don't advance
      this.log('Waiting for players to reconnect...');
      return;
    }

    let nextIndex = this.currentPlayerIndex;
    let loopCount = 0;
    do {
      nextIndex = (nextIndex + 1) % this.players.length;
      loopCount++;
      // Prevent infinite loop if all players are inactive
      if (loopCount > this.players.length) break;
    } while ((this.players[nextIndex].isBankrupt || this.players[nextIndex].isDisconnected) && nextIndex !== this.currentPlayerIndex);

    this.currentPlayerIndex = nextIndex;
    const nextPlayer = this.players[nextIndex];

    // Check Vacation Status
    if ((nextPlayer.vacationTurnsLeft || 0) > 0) {
        nextPlayer.vacationTurnsLeft = (nextPlayer.vacationTurnsLeft || 0) - 1;
        this.log(`${nextPlayer.name} is on vacation! Skipping turn (${nextPlayer.vacationTurnsLeft} left).`);
        
        // Notify state change so clients see the log and updated counter
        if (this.onStateChange) this.onStateChange(this.getState());

        // Find the next player immediately (Recursive)
        // Check availability again to be safe (though we know map is same)
        this.advanceToNextPlayer(); 
        return;
    }

    this.log(`${nextPlayer.name}'s turn`);

    // Trigger bot turn if needed
    this.processBotTurn();
  }

  // BOT PROCESSING
  async processBotTurn() {
      const player = this.getCurrentPlayer();
      console.log(`[BotDebug] Processing turn for ${player.name} (${player.id}). isBot=${player.isBot}`);
      
      if (!player.isBot || !this.gameStarted || this.gameOver) {
          console.log(`[BotDebug] Skipping: isBot=${player.isBot}, GameStarted=${this.gameStarted}, GameOver=${this.gameOver}`);
          return;
      }

      // Small delay for natural feel
      setTimeout(async () => {
          // Double check current player is still this bot (e.g. game didn't change state wildly)
          if (this.getCurrentPlayer().id !== player.id) return;
          
          try {
              const decision = BotLogic.decideAction(this.getState(), player.id);
              console.log(`[BotDebug] Decision for ${player.name}:`, decision);
              
              if (!decision) return;

              switch(decision.action) {
                  case 'roll_dice':
                      this.rollDice(player.id);
                      this.notifyStateChange();
                      // If logic says roll, we roll. Then check recursively?
                      // The rollDice changes state (position). 
                      // We need to re-evaluate after roll.
                      // Rolling calls 'handleLanding' which might do things.
                      // So we should schedule another check.
                      setTimeout(() => this.processBotTurn(), 1000); // Check what to do after landing
                      break;
                  case 'buy_property':
                      this.buyProperty(player.id);
                      this.notifyStateChange();
                      setTimeout(() => this.processBotTurn(), 1000);
                      break;
                  case 'pay_jail_fine':
                      this.payJailFine(player.id);
                      this.notifyStateChange();
                      // turn ends implicitly in payJailFine logic (I think?)
                      // Let's check payJailFine implementation... 
                      // It calls advanceToNextPlayer() which calls processBotTurn() for NEXT player.
                      break;
                  case 'use_jail_card':
                      this.useJailCard(player.id);
                      this.notifyStateChange();
                      setTimeout(() => this.processBotTurn(), 1000);
                      break;
                  case 'build_house':
                      if (decision.tileId) {
                          this.buildHouse(player.id, decision.tileId);
                          this.notifyStateChange();
                          // Maybe build more?
                          setTimeout(() => this.processBotTurn(), 500);
                      }
                      break;
                  case 'end_turn':
                      this.endTurn(player.id);
                      this.notifyStateChange();
                      break;
                  default:
                      console.log('Bot decided unknown action:', decision);
                      this.endTurn(player.id); // Fallback
                      this.notifyStateChange();
                      break;
              }
          } catch (e: any) {
              console.error('Bot Error:', e.message);
              // If bot errors out (e.g. can't buy), just force end turn to prevent lock
              try { this.endTurn(player.id); } catch (err) {} 
          }
      }, 1500); // 1.5s delay before acting
  }

  // ============================================
  // TRADING
  // ============================================

  proposeTrade(fromId: string, toId: string, offer: { offerProperties: string[], offerMoney: number, requestProperties: string[], requestMoney: number }) {
    const from = this.getPlayer(fromId);
    const to = this.getPlayer(toId);
    
    // Validate not empty trade
    const hasContent = offer.offerProperties.length > 0 || offer.offerMoney > 0 || 
                       offer.requestProperties.length > 0 || offer.requestMoney > 0;
    if (!hasContent) throw new Error('Cannot send empty trade');
    
    // Validate ownership
    for (const propId of offer.offerProperties) {
      const tile = this.board.find(t => t.id === propId);
      if (!tile || tile.owner !== fromId) throw new Error('You dont own that property');
      if (tile.houses > 0) throw new Error('Sell buildings before trading');
    }
    for (const propId of offer.requestProperties) {
      const tile = this.board.find(t => t.id === propId);
      if (!tile || tile.owner !== toId) throw new Error('They dont own that property');
      if (tile.houses > 0) throw new Error('Cannot trade property with buildings');
    }
    
    if (offer.offerMoney > 0 && from.money < offer.offerMoney) throw new Error('Not enough money');
    
    const trade: TradeOffer = {
      id: Math.random().toString(36).substring(2, 8),
      fromPlayerId: fromId,
      toPlayerId: toId,
      offerProperties: offer.offerProperties,
      offerMoney: offer.offerMoney,
      requestProperties: offer.requestProperties,
      requestMoney: offer.requestMoney,
      status: 'PENDING'
    };
    
    this.trades.push(trade);
    this.log(`${from.name} proposed a trade to ${to.name}`);
    
    // Check if recipient is a bot
    if (to.isBot) {
        setTimeout(() => {
            const shouldAccept = BotLogic.evaluateTrade(this.getState(), toId, trade);
            if (shouldAccept) {
                this.acceptTrade(toId, trade.id);
                this.notifyStateChange();
            } else {
                this.rejectTrade(toId, trade.id);
                this.notifyStateChange();
            }
        }, 2000); // 2s delay for realism
    }

    return trade.id;
  }

  acceptTrade(playerId: string, tradeId: string) {
    const trade = this.trades.find(t => t.id === tradeId);
    if (!trade) throw new Error('Trade not found');
    if (trade.toPlayerId !== playerId) throw new Error('Not your trade to accept');
    if (trade.status !== 'PENDING') throw new Error('Trade no longer pending');
    
    const from = this.getPlayer(trade.fromPlayerId);
    const to = this.getPlayer(trade.toPlayerId);
    
    // Validate that all properties are still owned by expected players
    for (const propId of trade.offerProperties) {
      const tile = this.board.find(t => t.id === propId);
      if (!tile || tile.owner !== from.id) {
        const propName = tile?.name || propId;
        throw new Error(`Trade invalid: ${from.name} no longer owns ${propName}`);
      }
    }
    for (const propId of trade.requestProperties) {
      const tile = this.board.find(t => t.id === propId);
      if (!tile || tile.owner !== to.id) {
        const propName = tile?.name || propId;
        throw new Error(`Trade invalid: ${to.name} no longer owns ${propName}`);
      }
    }
    
    // Final validation - money
    if (trade.offerMoney > 0 && from.money < trade.offerMoney) throw new Error('Offerer lacks funds');
    if (trade.requestMoney > 0 && to.money < trade.requestMoney) throw new Error('You lack funds');
    
    // Execute trade - transfer properties
    for (const propId of trade.offerProperties) {
      const tile = this.board.find(t => t.id === propId)!;
      tile.owner = to.id;
      from.properties = from.properties.filter(p => p !== propId);
      to.properties.push(propId);
    }
    for (const propId of trade.requestProperties) {
      const tile = this.board.find(t => t.id === propId)!;
      tile.owner = from.id;
      to.properties = to.properties.filter(p => p !== propId);
      from.properties.push(propId);
    }
    
    // Transfer money
    from.money -= trade.offerMoney;
    to.money += trade.offerMoney;
    to.money -= trade.requestMoney;
    from.money += trade.requestMoney;
    
    trade.status = 'ACCEPTED';
    trade.status = 'ACCEPTED';
    // Track stats
    from.stats.trades++;
    to.stats.trades++;

    this.log(`${to.name} accepted trade from ${from.name}`);
  }

  counterTrade(playerId: string, tradeId: string, offer: { offerProperties: string[], offerMoney: number, requestProperties: string[], requestMoney: number }) {
    const trade = this.trades.find(t => t.id === tradeId);
    if (!trade) throw new Error('Trade not found');
    if (trade.toPlayerId !== playerId) throw new Error('Not your turn to negotiate this trade');
    
    // Validate new content
    const from = this.getPlayer(playerId); // The person countering is now the "From" (Sender)
    const to = this.getPlayer(trade.fromPlayerId); // The original sender is now the "To" (Recipient)

    // Run same validation as proposeTrade
    const hasContent = offer.offerProperties.length > 0 || offer.offerMoney > 0 || 
                       offer.requestProperties.length > 0 || offer.requestMoney > 0;
    if (!hasContent) throw new Error('Cannot send empty trade');
    
    // Check ownership for the COUNTER offer
    for (const propId of offer.offerProperties) {
      const tile = this.board.find(t => t.id === propId);
      if (!tile || tile.owner !== from.id) throw new Error('You dont own that property');
      if (tile.houses > 0) throw new Error('Sell buildings before trading');
    }
    for (const propId of offer.requestProperties) {
      const tile = this.board.find(t => t.id === propId);
      if (!tile || tile.owner !== to.id) throw new Error('They dont own that property');
      if (tile.houses > 0) throw new Error('Cannot trade property with buildings');
    }
    
    // Update Trade Record (Swap roles)
    trade.fromPlayerId = from.id;
    trade.toPlayerId = to.id; // Swap
    trade.offerProperties = offer.offerProperties;
    trade.offerMoney = offer.offerMoney;
    trade.requestProperties = offer.requestProperties;
    trade.requestMoney = offer.requestMoney;
    trade.status = 'PENDING';

    this.log(`${from.name} sent a counter-offer to ${to.name}`);
  }

  rejectTrade(playerId: string, tradeId: string) {
    const trade = this.trades.find(t => t.id === tradeId);
    if (!trade) throw new Error('Trade not found');
    if (trade.toPlayerId !== playerId) throw new Error('Not your trade');
    
    trade.status = 'REJECTED';
    this.log('Trade rejected');
  }

  cancelTrade(playerId: string, tradeId: string) {
    const trade = this.trades.find(t => t.id === tradeId);
    if (!trade) throw new Error('Trade not found');
    if (trade.fromPlayerId !== playerId) throw new Error('Not your trade');
    
    trade.status = 'CANCELLED';
    this.log('Trade cancelled');
  }

  // ============================================
  // AUCTION
  // ============================================

  declineProperty(playerId: string) {
    const player = this.getPlayer(playerId);
    if (this.getCurrentPlayer().id !== playerId) throw new Error('Not your turn');
    
    const tile = this.board[player.position];
    if (tile.owner) throw new Error('Already owned');
    if (!['PROPERTY', 'RAILROAD', 'UTILITY'].includes(tile.type)) throw new Error('Not purchasable');
    
    this.log(`${player.name} declined to buy ${tile.name}`);
    
    if (this.config.auctionEnabled) {
      this.startAuction(tile);
    }
  }

  private startAuction(tile: Tile) {
    this.auction = {
      tileId: tile.id,
      tileName: tile.name,
      currentBid: 0,
      highestBidderId: undefined,
      highestBidderName: undefined,
      participants: this.getActivePlayers().map(p => p.id),
      endTime: Date.now() + 10000, // 10 seconds
      isActive: true
    };
    this.log(`Auction started for ${tile.name}!`);
  }

  placeBid(playerId: string, amount: number) {
    if (!this.auction || !this.auction.isActive) throw new Error('No active auction');
    
    const player = this.getPlayer(playerId);
    if (amount <= this.auction.currentBid) throw new Error('Bid must be higher');
    if (amount > player.money) throw new Error('Not enough money');
    
    this.auction.currentBid = amount;
    this.auction.highestBidderId = playerId;
    this.auction.highestBidderName = player.name;
    this.auction.endTime = Date.now() + 6000; // Reset timer to 6 seconds on bid
    
    this.log(`${player.name} bid $${amount}`);
  }

  completeAuction(): boolean {
    if (!this.auction) return false;
    
    if (this.auction.highestBidderId && this.auction.currentBid > 0) {
      const winner = this.getPlayer(this.auction.highestBidderId);
      const tile = this.board.find(t => t.id === this.auction!.tileId)!;
      
      winner.money -= this.auction.currentBid;
      tile.owner = winner.id;
      winner.properties.push(tile.id);
      
      this.log(`${winner.name} won ${tile.name} for $${this.auction.currentBid}`);
    } else {
      this.log('Auction ended with no bids');
    }
    
    this.auction = undefined;
    return true;
  }

  // ============================================
  // BANKRUPTCY
  // ============================================

  private declareBankruptcy(player: Player, creditorId?: string) {
    player.isBankrupt = true;
    this.log(`${player.name} is bankrupt!`);
    
    // Transfer all assets to creditor or bank
    for (const propId of player.properties) {
      const tile = this.board.find(t => t.id === propId)!;
      if (creditorId) {
        tile.owner = creditorId;
        const creditor = this.getPlayer(creditorId);
        creditor.properties.push(propId);
      } else {
        tile.owner = undefined;
        tile.houses = 0;
        tile.isMortgaged = false;
      }
    }
    
    player.properties = [];
    
    if (creditorId) {
      const creditor = this.getPlayer(creditorId);
      creditor.money += player.money;
    }
    player.money = 0;

    player.money = 0;

    this.checkForWinner();
    this.checkForBotOnlyGame();
  }

  voluntaryBankrupt(playerId: string) {
    const player = this.getPlayer(playerId);
    if (player.isBankrupt) throw new Error('Already bankrupt');
    
    const isCurrentTurn = this.getCurrentPlayer().id === playerId;
    this.declareBankruptcy(player);
    
    // If it was their turn, immediately end it and move to next player
    if (isCurrentTurn) {
        this.log(`${player.name} ended turn via bankruptcy`);
        this.currentCard = undefined;
        this.advanceToNextPlayer();
    }
  }

  restartGame(requesterId: string) {
    // Basic validation? maybe only host? optional.
    
    this.gameStarted = true;
    this.startedAt = Date.now();
    this.totalTurns = 0;
    this.gameOver = false;
    this.winnerId = undefined;
    this.currentCard = undefined;
    this.freeParkingPot = 0;
    this.trades = [];
    this.auction = undefined;
    this.actionLog = [];
    this.doublesCount = 0;
    this.canRollAgain = false;
    this.mustRoll = true;
    this.currentPlayerIndex = 0;

    // Reset Board
    this.board.forEach(tile => {
        tile.owner = undefined;
        tile.houses = 0;
        tile.isMortgaged = false;
    });

    // Reset Players
    this.players.forEach(p => {
        p.money = this.config.startingCash;
        p.position = 0;
        p.properties = [];
        p.isJailed = false;
        p.jailTurns = 0;
        p.getOutOfJailCards = 0;
        p.isBankrupt = false;
        p.vacationFund = 0;
        p.vacationTurnsLeft = 0;
        p.vacationTurnsLeft = 0;
        p.wealthHistory = [this.config.startingCash];
        p.stats = {
            doubles: 0,
            trades: 0,
            chatMessages: 0,
            tileVisits: {}
        };
    });
    
    // Shuffle if needed
    if (this.config.randomizeOrder) {
        for (let i = this.players.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.players[i], this.players[j]] = [this.players[j], this.players[i]];
        }
    }

    this.log(`Game restarted by ${this.getPlayer(requesterId).name}!`);
    this.log(`${this.getCurrentPlayer().name} starts`);
  }

  // ============================================
  // STATE
  // ============================================

  getState(): GameState {
    return {
      id: this.id,
      roomName: this.roomName,
      config: this.config,
      players: this.players,
      currentPlayerIndex: this.currentPlayerIndex,
      board: this.board,
      gameStarted: this.gameStarted,
      gameOver: this.gameOver,
      winnerId: this.winnerId,
      dice: this.dice,
      doublesCount: this.doublesCount,
      canRollAgain: this.canRollAgain,
      mustRoll: this.mustRoll,
      startedAt: this.startedAt,
      totalTurns: this.totalTurns,
      lastAction: this.actionLog[0] || '',
      actionLog: this.actionLog.slice(0, 20),
      chanceDeck: [],
      communityChestDeck: [],
      currentCard: this.currentCard,
      freeParkingPot: this.freeParkingPot,
      trades: this.trades.filter(t => t.status === 'PENDING'),
      auction: this.auction,
      awaitingBuyDecision: this.awaitingBuyDecision
    };
  }

  getRoomInfo(): { id: string; name: string; hostName: string; playerCount: number; maxPlayers: number; isPrivate: boolean; gameStarted: boolean; mapId: string } {
    const host = this.players.find(p => p.isHost);
    return {
      id: this.id,
      name: this.roomName,
      hostName: host?.name || 'Unknown',
      playerCount: this.players.length,
      maxPlayers: this.config.maxPlayers,
      isPrivate: this.config.isPrivate,
      gameStarted: this.gameStarted,
      mapId: this.config.mapId
    };
  }

  recordChatMessage(playerId: string) {
    const player = this.players.find(p => p.id === playerId);
    if (player) {
      player.stats.chatMessages++;
    }
  }
}
