import Groq from 'groq-sdk';
import { GameState, Player, Tile, TradeOffer } from '../types';

export class GroqClient {
  private static client: Groq;
  private static isInitialized = false;

  static initialize() {
    if (this.isInitialized) return;

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      console.warn('GROQ_API_KEY not found in environment variables. Bot will use fallback logic.');
      return;
    }

    this.client = new Groq({
      apiKey: apiKey
    });
    this.isInitialized = true;
    console.log('Groq Client initialized for Bot AI');
  }



  // Helper for timeout
  private static async withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
      let timeoutId: NodeJS.Timeout;
      const timeoutPromise = new Promise<T>((resolve) => {
          timeoutId = setTimeout(() => {
              console.log('Groq API Timeout - using fallback');
              resolve(fallback);
          }, ms);
      });

      try {
          const result = await Promise.race([promise, timeoutPromise]);
          clearTimeout(timeoutId!);
          return result;
      } catch (error) {
          clearTimeout(timeoutId!);
          throw error;
      }
  }

  static async decideAction(gameState: GameState, botId: string): Promise<{ action: string; [key: string]: any } | null> {
    if (!this.isInitialized) return null;

    const bot = gameState.players.find(p => p.id === botId);
    if (!bot) return null;

    // Construct a concise prompt
    const prompt = this.constructActionPrompt(gameState, bot);
    const personality = bot.personality || 'Balanced';

    const apiCall = async () => {
        try {
          const chatCompletion = await this.client.chat.completions.create({
            messages: [
              {
                role: 'system',
                content: `You are a ${personality} Monopoly bot.
                Aggressive: Takes risks, buys everything, trades for monopolies.
                Conservative: Saves money, avoids auctions, trades carefully.
                Balanced: Mix of both.
                Chaotic: Unpredictable.

                Available actions: 
                - "roll_dice": start of turn.
                - "buy_property": landed on unowned property.
                - "build_house": have monopoly + money.
                - "end_turn": nothing else to do.
                - "pay_jail_fine": in jail + money.
                - "use_jail_card": in jail + card.
                - "declare_bankruptcy": if debt > assets.
                
                Return JSON: { "action": "ACTION_NAME", "reason": "...", "tileId": "..." }`
              },
              { role: 'user', content: prompt }
            ],
            model: 'llama-3.3-70b-versatile',
            temperature: 0.6,
            max_tokens: 150,
            response_format: { type: 'json_object' }
          });
          const content = chatCompletion.choices[0]?.message?.content;
          return content ? JSON.parse(content) : null;
        } catch (error) {
          console.error('Groq Action Error:', error);
          return null;
        }
    };

    return this.withTimeout(apiCall(), 10000, null);
  }

  static async getAuctionMaxBid(gameState: GameState, botId: string, auction: any): Promise<number> {
      if (!this.isInitialized) return 0;
      const bot = gameState.players.find(p => p.id === botId);
      if (!bot) return 0;

      const prompt = `
        Auction for: ${auction.tileName}
        My Money: $${bot.money}
        My Properties: ${bot.properties.length}
        Personality: ${bot.personality || 'Balanced'}
        What is the MAXIMUM amount I should bid for this property?
        Return JSON: { "maxBid": number }
      `;

      const apiCall = async () => {
        try {
            const response = await this.client.chat.completions.create({
                messages: [
                    { role: 'system', content: 'Return JSON: { "maxBid": number }' },
                    { role: 'user', content: prompt }
                ],
                model: 'llama-3.3-70b-versatile',
                response_format: { type: 'json_object' }
            });
            const result = JSON.parse(response.choices[0]?.message?.content || '{}');
            return result.maxBid || 0;
        } catch (e) { return 0; }
      };

      return this.withTimeout(apiCall(), 8000, 0);
  }

  static async formulateTrade(gameState: GameState, botId: string): Promise<any | null> {
      if (!this.isInitialized) return null;
      const bot = gameState.players.find(p => p.id === botId);
      if (!bot) return null;

      // Find players with properties we need
      const opponents = gameState.players.filter(p => p.id !== botId && !p.isBankrupt && !p.isDisconnected);
      if (opponents.length === 0) return null;

      const prompt = `
        My Money: $${bot.money}
        My Properties: [${bot.properties.join(', ')}]
        Opponents: ${JSON.stringify(opponents.map(p => ({ id: p.id, name: p.name, properties: p.properties })))}
        Personality: ${bot.personality || 'Balanced'}
        
        Propose a trade to complete a monopoly or get cash.
        Return JSON: { "targetPlayerId": "...", "offerMoney": 0, "offerProperties": [], "requestMoney": 0, "requestProperties": [] }
        Or null if no good trade.
      `;

      const apiCall = async () => {
       try {
        const response = await this.client.chat.completions.create({
            messages: [
                { role: 'system', content: 'Propose a strategic trade. Return JSON or null.' },
                { role: 'user', content: prompt }
            ],
            model: 'llama-3.3-70b-versatile',
            response_format: { type: 'json_object' }
        });
        const content = response.choices[0]?.message?.content;
        return content ? JSON.parse(content) : null;
      } catch (e) { return null; }
     };

     return this.withTimeout(apiCall(), 10000, null);
  }

  static async resolveDebt(gameState: GameState, botId: string): Promise<{ action: string; tileId?: string } | null> {
      if (!this.isInitialized) return null;
      const bot = gameState.players.find(p => p.id === botId);
      if (!bot) return null;
      
      const prompt = `
        I am in debt! Money: $${bot.money}
        Properties: ${JSON.stringify(bot.properties)}
        What should I do to survive?
        Actions: "mortgage_property", "sell_house", "sell_property", "declare_bankruptcy"
        Return JSON: { "action": "...", "tileId": "..." }
      `;

      const apiCall = async () => {
       try {
        const response = await this.client.chat.completions.create({
            messages: [
                { role: 'system', content: 'You are in debt. Choose the best action to raise funds. Return JSON.' },
                { role: 'user', content: prompt }
            ],
            model: 'llama-3.3-70b-versatile',
            response_format: { type: 'json_object' }
        });
        return JSON.parse(response.choices[0]?.message?.content || '{}');
      } catch (e) { return null; }
     };

     return this.withTimeout(apiCall(), 8000, null);
  }

  static async evaluateTrade(gameState: GameState, botId: string, trade: TradeOffer): Promise<boolean> {
    if (!this.isInitialized) return false; 

    const bot = gameState.players.find(p => p.id === botId);
    if (!bot) return false;

    const prompt = this.constructTradePrompt(gameState, bot, trade);
    const personality = bot.personality || 'Balanced';

    const apiCall = async () => {
        try {
        const chatCompletion = await this.client.chat.completions.create({
            messages: [
            {
                role: 'system',
                content: `You are a ${personality} Monopoly bot. Evaluate this trade offer.
                Return JSON format: { "accept": boolean, "reason": "short explanation" }`
            },
            {
                role: 'user',
                content: prompt
            }
            ],
            model: 'llama-3.3-70b-versatile',
            temperature: 0.3,
            max_tokens: 100,
            response_format: { type: 'json_object' }
        });

        const content = chatCompletion.choices[0]?.message?.content;
        if (!content) return false;

        const result = JSON.parse(content);
        console.log(`[Groq Bot ${bot.name}] Trade Evaluation: ${result.accept ? 'ACCEPT' : 'REJECT'} (${result.reason})`);
        return result.accept;

        } catch (error) {
        console.error('Groq API Error (Trade):', error);
        return false; // Safe fallback
        }
    };
    
    return this.withTimeout(apiCall(), 10000, false);
  }

  private static constructActionPrompt(gameState: GameState, bot: Player): string {
    const properties = gameState.board.filter(t => t.owner === bot.id).map(t => t.name).join(', ');
    const currentTile = gameState.board[bot.position];
    const money = bot.money;
    
    // Simplify state for token limit
    const context = {
      botName: bot.name,
      money: money,
      position: currentTile.name,
      isJailed: bot.isJailed,
      properties: properties,
      canRoll: gameState.mustRoll || gameState.canRollAgain,
      tileType: currentTile.type,
      tileOwner: currentTile.owner ? (currentTile.owner === bot.id ? 'ME' : 'OPPONENT') : 'BANK',
      tilePrice: currentTile.price,
      isMortgaged: currentTile.isMortgaged,
      personality: bot.personality
    };

    return JSON.stringify(context);
  }

  private static constructTradePrompt(gameState: GameState, bot: Player, trade: TradeOffer): string {
    const givingProps = trade.requestProperties.map(id => gameState.board.find(t => t.id === id)?.name || id).join(', ');
    const gettingProps = trade.offerProperties.map(id => gameState.board.find(t => t.id === id)?.name || id).join(', ');
    
    return `
      My Money: ${bot.money}
      Trade Offer:
      - I Give: $${trade.requestMoney} + Properties: [${givingProps}]
      - I Get: $${trade.offerMoney} + Properties: [${gettingProps}]
      
      Is this a good deal for me?
    `;
  }
}
