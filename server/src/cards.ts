import { Card } from './types';

// ============================================
// CHANCE CARDS
// ============================================
export const chanceCards: Card[] = [
  {
    id: 'chance_1',
    type: 'CHANCE',
    description: 'Advance to GO. Collect $200.',
    action: 'MOVE_TO',
    destination: 0,
    value: 200
  },
  {
    id: 'chance_2',
    type: 'CHANCE',
    description: 'Bank pays you dividend of $50.',
    action: 'MONEY',
    value: 50
  },
  {
    id: 'chance_3',
    type: 'CHANCE',
    description: 'Go directly to Jail. Do not pass GO.',
    action: 'JAIL'
  },
  {
    id: 'chance_4',
    type: 'CHANCE',
    description: 'Your building loan matures. Collect $150.',
    action: 'MONEY',
    value: 150
  },
  {
    id: 'chance_5',
    type: 'CHANCE',
    description: 'You have been elected Chairman of the Board. Pay each player $50.',
    action: 'PAY_ALL',
    value: 50
  },
  {
    id: 'chance_6',
    type: 'CHANCE',
    description: 'Speeding fine. Pay $15.',
    action: 'MONEY',
    value: -15
  },
  {
    id: 'chance_7',
    type: 'CHANCE',
    description: 'Get out of Jail Free card.',
    action: 'GET_OUT_OF_JAIL'
  },
  {
    id: 'chance_8',
    type: 'CHANCE',
    description: 'Go back 3 spaces.',
    action: 'MOVE',
    value: -3
  },
  {
    id: 'chance_9',
    type: 'CHANCE',
    description: 'Make general repairs. Pay $25 per house and $100 per hotel.',
    action: 'REPAIRS',
    value: 25 // per house, hotels = value * 4
  },
  {
    id: 'chance_10',
    type: 'CHANCE',
    description: 'You have won a crossword competition. Collect $100.',
    action: 'MONEY',
    value: 100
  }
];

// ============================================
// COMMUNITY CHEST CARDS
// ============================================
export const communityChestCards: Card[] = [
  {
    id: 'cc_1',
    type: 'COMMUNITY_CHEST',
    description: 'Advance to GO. Collect $200.',
    action: 'MOVE_TO',
    destination: 0,
    value: 200
  },
  {
    id: 'cc_2',
    type: 'COMMUNITY_CHEST',
    description: 'Bank error in your favor. Collect $200.',
    action: 'MONEY',
    value: 200
  },
  {
    id: 'cc_3',
    type: 'COMMUNITY_CHEST',
    description: 'Doctor\'s fee. Pay $50.',
    action: 'MONEY',
    value: -50
  },
  {
    id: 'cc_4',
    type: 'COMMUNITY_CHEST',
    description: 'From sale of stock you get $50.',
    action: 'MONEY',
    value: 50
  },
  {
    id: 'cc_5',
    type: 'COMMUNITY_CHEST',
    description: 'Get out of Jail Free card.',
    action: 'GET_OUT_OF_JAIL'
  },
  {
    id: 'cc_6',
    type: 'COMMUNITY_CHEST',
    description: 'Go directly to Jail. Do not pass GO.',
    action: 'JAIL'
  },
  {
    id: 'cc_7',
    type: 'COMMUNITY_CHEST',
    description: 'It is your birthday. Collect $10 from every player.',
    action: 'COLLECT_FROM_ALL',
    value: 10
  },
  {
    id: 'cc_8',
    type: 'COMMUNITY_CHEST',
    description: 'Income tax refund. Collect $20.',
    action: 'MONEY',
    value: 20
  },
  {
    id: 'cc_9',
    type: 'COMMUNITY_CHEST',
    description: 'Life insurance matures. Collect $100.',
    action: 'MONEY',
    value: 100
  },
  {
    id: 'cc_10',
    type: 'COMMUNITY_CHEST',
    description: 'Pay hospital fees of $100.',
    action: 'MONEY',
    value: -100
  },
  {
    id: 'cc_11',
    type: 'COMMUNITY_CHEST',
    description: 'You inherit $100.',
    action: 'MONEY',
    value: 100
  },
  {
    id: 'cc_12',
    type: 'COMMUNITY_CHEST',
    description: 'You have won second prize in a beauty contest. Collect $10.',
    action: 'MONEY',
    value: 10
  }
];

// Shuffle function
export function shuffleDeck<T>(deck: T[]): T[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
