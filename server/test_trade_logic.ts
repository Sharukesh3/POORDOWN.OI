
// Run with: npx ts-node server/test_trade_logic.ts

import { Game } from './src/game/Game';

const game = new Game('test-room', 'Test Room', { startingCash: 1500 });
game.addPlayer('p1', 'Player 1');
game.addPlayer('p2', 'Player 2');

game.startGame('p1');

const p1 = game.getState().players.find(p => p.id === 'p1')!;
const p2 = game.getState().players.find(p => p.id === 'p2')!;

// Assign a property to P1 manually for testing
const tile = game.getState().board.find(t => t.id === 'mediterranean_avenue')!; // ID might vary, checking default map
if (!tile) {
    console.error('Could not find tile');
    process.exit(1);
}

// Emulate P1 buying the property
const boardTile = game.getState().board[1]; // Mediterranean Avenue is usually index 1
boardTile.owner = 'p1';
p1.properties.push(boardTile.id);
p1.money -= 60;

console.log('--- Initial State ---');
console.log('P1 Properties:', p1.properties);
console.log('P2 Properties:', p2.properties);
console.log('Tile Owner:', boardTile.owner);

// P1 proposes trade to P2: Give Property for $100
console.log('\n--- Proposing Trade ---');
const tradeId = game.proposeTrade('p1', 'p2', {
    offerProperties: [boardTile.id],
    offerMoney: 0,
    requestProperties: [],
    requestMoney: 100
});

console.log('Trade Proposed via ID:', tradeId);

// P2 Accepts
console.log('\n--- Accepting Trade ---');
game.acceptTrade('p2', tradeId);

// Check Result
const finalState = game.getState();
const p1Final = finalState.players.find(p => p.id === 'p1')!;
const p2Final = finalState.players.find(p => p.id === 'p2')!;
const tileFinal = finalState.board.find(t => t.id === boardTile.id)!;

console.log('P1 Properties:', p1Final.properties);
console.log('P2 Properties:', p2Final.properties);
console.log('Tile Owner:', tileFinal.owner);

if (p1Final.properties.includes(boardTile.id)) {
    console.error('FAIL: P1 still has the property!');
} else if (!p2Final.properties.includes(boardTile.id)) {
    console.error('FAIL: P2 did not receive the property!');
} else if (tileFinal.owner !== 'p2') {
    console.error('FAIL: Tile owner is not P2!');
} else {
    console.log('SUCCESS: Ownership transferred correctly.');
}
