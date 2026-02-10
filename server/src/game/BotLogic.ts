import { GameState, Player, Tile } from '../types';
import { GroqClient } from '../services/GroqClient';

export class BotLogic {

  static async decideAction(gameState: GameState, botId: string): Promise<{ action: string; [key: string]: any } | null> {
    const bot = gameState.players.find(p => p.id === botId);
    if (!bot) return null;

    // 0. Try AI Decision first
    try {
        const aiDecision = await GroqClient.decideAction(gameState, botId);
        if (aiDecision) return aiDecision;
    } catch (e) {
        console.error('AI Decision Failed, falling back to rule-based:', e);
    }

    // FALLBACK: Existing Rule-Based Logic
    // 1. If in Jail, try to get out
    if (bot.isJailed) {
      if (bot.getOutOfJailCards > 0) {
        return { action: 'use_jail_card' };
      }
      // If rich, pay fine
      if (bot.money > 500) {
        return { action: 'pay_jail_fine' };
      }
      // Otherwise roll
      return { action: 'roll_dice' };
    }

    // 2. If turn not started (mustRoll is true), roll dice
    if (gameState.mustRoll) {
      return { action: 'roll_dice' };
    }

    // 3. If landed on unowned property, decide to buy
    const currentTile = gameState.board[bot.position];
    if (
      ['PROPERTY', 'RAILROAD', 'UTILITY'].includes(currentTile.type) &&
      !currentTile.owner &&
      currentTile.price
    ) {
      // Buy if we have enough money + buffer ($200)
      if (bot.money >= currentTile.price + 200) {
        return { action: 'buy_property' };
      } else {
          // If auction enabled, this would be where we trigger it or decline
          // For now, if we don't buy, we just end turn? 
          // Wait, if we don't buy, standard rules often imply auction. 
          // Use 'end_turn' which implicitly declines buying if the game doesn't enforce auction 
          // OR explicitly decline if that logic exists. Since game.ts has 'declineProperty', we might use that if supported.
          // But for simple start: just end turn.
      }
    }
    
    // 4. If waiting for buy decision (gameState might track this, but currently it's implicit in game flow)
    // We already handled the "buy if possible" above.

    // 5. Build Houses (Simplistic: Randomly build if rich)
    if (bot.money > 800) {
        // Find a monopoly we own
        const monopolyGroups = this.getMonopolyGroups(gameState, bot.id);
        for (const group of monopolyGroups) {
            const properties = gameState.board.filter(t => t.group === group);
            // Find one with least houses (even build)
            // Sort by houses ascending
            properties.sort((a, b) => a.houses - b.houses);
            const target = properties[0];
            if (target && target.houses < 5 && !target.isMortgaged) {
                // Check if cost affordable
                const cost = target.houseCost || 100;
                if (bot.money >= cost + 300) { // Ensure buffer
                    return { action: 'build_house', tileId: target.id };
                }
            }
        }
    }

    // 6. Handle Jail Time / Doubles (if canRollAgain)
    if (gameState.canRollAgain && !gameState.gameOver) {
        return { action: 'roll_dice' };
    }

  // 7. Otherwise, End Turn
    return { action: 'end_turn' };
  }

  static async evaluateTrade(gameState: GameState, botId: string, trade: any): Promise<boolean> {
      const bot = gameState.players.find(p => p.id === botId);
      if (!bot) return false;

      // Try AI Evaluation
      try {
          const aiAccept = await GroqClient.evaluateTrade(gameState, botId, trade);
          return aiAccept;
      } catch (e) {
          console.error('AI Trade Eval Failed:', e);
      }

      // Simple Logic fallback:
      // 1. If receiving money > 0 and giving nothing -> ACCEPT
      // 2. If receiving needed property for monopoly -> ACCEPT
      // 3. Reject otherwise for now (to be safe)
      
      const isGivingProperty = trade.requestProperties.length > 0;
      const isGettingMoney = trade.offerMoney > 0;
      const isGivingMoney = trade.requestMoney > 0;
      
      // Free money?
      if (!isGivingProperty && !isGivingMoney && isGettingMoney) return true;
      
      // Calculate value? 
      // Very basic: 
      // If I'm getting a property I need for a monopoly, and giving less than $500 or a single unneeded property.
      
      const botMonopolies = this.getMonopolyGroups(gameState, botId);
      const neededForMonopoly = gameState.board.filter(t => 
          t.group && 
          !botMonopolies.includes(t.group) && 
          (gameState.players.find(p => p.id === t.owner)?.id === botId || trade.offerProperties.includes(t.id))
      );
      
      // Check if offered property completes a monopoly
      // This logic is complex. Let's stick to "Accept if getting money > $100 and giving no properties" OR "Randomly accept if receiving > giving"
      
      // Temporary: Accept any trade that gives money and takes nothing
      if (trade.offerMoney > 0 && trade.requestProperties.length === 0 && trade.requestMoney === 0) return true;
      
      // Reject complex trades for now to avoid bot being scammed
      return false; 
  }

  // Helper moved to public or kept private but used above
  private static getMonopolyGroups(state: GameState, playerId: string): string[] {
      const ownedGroups: { [key: string]: number } = {};
      const groupCounts: { [key: string]: number } = {};

      state.board.forEach(t => {
          if (t.group) {
              groupCounts[t.group] = (groupCounts[t.group] || 0) + 1;
              if (t.owner === playerId) {
                  ownedGroups[t.group] = (ownedGroups[t.group] || 0) + 1;
              }
          }
      });

      return Object.keys(groupCounts).filter(g => ownedGroups[g] === groupCounts[g]);
  }
}
