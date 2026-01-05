export interface Tile {
  id: string;
  name: string;
  type: 'PROPERTY' | 'RAILROAD' | 'UTILITY' | 'GO' | 'JAIL' | 'FREE_PARKING' | 'GO_TO_JAIL' | 'TAX' | 'CHANCE' | 'COMMUNITY_CHEST';
  price?: number;
  rent?: number[]; // Array for rent levels (base, 1 house, ... hotel)
  group?: string; // Color group or type
  owner?: string; // Player ID
}

export interface Player {
  id: string;
  name: string;
  money: number;
  position: number; // Index on the board
  color: string;
  properties: string[]; // List of owned tile IDs
  isJailed: boolean;
  jailTurns: number;
}

export interface GameState {
  players: Player[];
  currentPlayerIndex: number;
  board: Tile[]; // Could be static config, but state might track dynamic changes if we want
  gameStarted: boolean;
  dice: number[];
  lastAction: string;
}

export interface ClientEvents {
  JOIN_GAME: (roomId: string, playerName: string) => void;
  ROLL_DICE: () => void;
  BUY_PROPERTY: () => void;
  END_TURN: () => void;
}

export interface ServerEvents {
  GAME_STATE_UPDATE: (state: GameState) => void;
  ERROR: (message: string) => void;
}
