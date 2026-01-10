import { Tile } from '../types';

export const createDefaultBoard = (): Tile[] => {
  const tiles: Tile[] = [];
  const propertyGroups = ['BROWN', 'LIGHT_BLUE', 'PINK', 'ORANGE', 'RED', 'YELLOW', 'GREEN', 'DARK_BLUE'];
  
  const add = (t: any) => tiles.push({ houses: 0, isMortgaged: false, ...t } as Tile);

  // Simplified board generation for prototype
  // 0: GO
  add({ id: 'go', name: 'GO', type: 'GO' });
  
  // 1: Mediterranean Avenue (Brown)
  add({ id: 'med_ave', name: 'Mediterranean Ave', type: 'PROPERTY', price: 60, rent: [2, 10, 30, 90, 160, 250], group: 'BROWN' });
  // 2: Community Chest
  add({ id: 'cc1', name: 'Community Chest', type: 'COMMUNITY_CHEST' });
  // 3: Baltic Avenue (Brown)
  add({ id: 'baltic_ave', name: 'Baltic Ave', type: 'PROPERTY', price: 60, rent: [4, 20, 60, 180, 320, 450], group: 'BROWN' });
  // 4: Income Tax
  add({ id: 'income_tax', name: 'Income Tax', type: 'TAX', price: 200 });
  // 5: Reading Railroad
  add({ id: 'reading_rr', name: 'Reading Railroad', type: 'RAILROAD', price: 200, rent: [25, 50, 100, 200] });
  
  // ... Adding a few more to test movement
  add({ id: 'or_ave', name: 'Oriental Ave', type: 'PROPERTY', price: 100, rent: [6, 30, 90, 270, 400, 550], group: 'LIGHT_BLUE' });
  add({ id: 'chance1', name: 'Chance', type: 'CHANCE' });
  add({ id: 'vt_ave', name: 'Vermont Ave', type: 'PROPERTY', price: 100, rent: [6, 30, 90, 270, 400, 550], group: 'LIGHT_BLUE' });
  add({ id: 'ct_ave', name: 'Connecticut Ave', type: 'PROPERTY', price: 120, rent: [8, 40, 100, 300, 450, 600], group: 'LIGHT_BLUE' });
  
  add({ id: 'jail', name: 'Jail', type: 'JAIL' });
  
  // Pink
  add({ id: 'st_charles', name: 'St. Charles Place', type: 'PROPERTY', price: 140, group: 'PINK' });
  add({ id: 'electric', name: 'Electric Company', type: 'UTILITY', price: 150 });
  add({ id: 'states_ave', name: 'States Ave', type: 'PROPERTY', price: 140, group: 'PINK' });
  add({ id: 'va_ave', name: 'Virginia Ave', type: 'PROPERTY', price: 160, group: 'PINK' });
  
  add({ id: 'penn_rr', name: 'Penn Railroad', type: 'RAILROAD', price: 200 });
  
  // Orange
  add({ id: 'st_james', name: 'St. James Place', type: 'PROPERTY', price: 180, group: 'ORANGE' });
  add({ id: 'cc2', name: 'Community Chest', type: 'COMMUNITY_CHEST' });
  add({ id: 'tn_ave', name: 'Tennessee Ave', type: 'PROPERTY', price: 180, group: 'ORANGE' });
  add({ id: 'ny_ave', name: 'New York Ave', type: 'PROPERTY', price: 200, group: 'ORANGE' });
  
  add({ id: 'free_parking', name: 'Free Parking', type: 'FREE_PARKING' });

  // Red
  add({ id: 'ky_ave', name: 'Kentucky Ave', type: 'PROPERTY', price: 220, group: 'RED' });
  add({ id: 'chance2', name: 'Chance', type: 'CHANCE' });
  add({ id: 'in_ave', name: 'Indiana Ave', type: 'PROPERTY', price: 220, group: 'RED' });
  add({ id: 'il_ave', name: 'Illinois Ave', type: 'PROPERTY', price: 240, group: 'RED' });
  
  add({ id: 'bo_rr', name: 'B. & O. Railroad', type: 'RAILROAD', price: 200 });

  // Yellow
  add({ id: 'atl_ave', name: 'Atlantic Ave', type: 'PROPERTY', price: 260, group: 'YELLOW' });
  add({ id: 'ven_ave', name: 'Ventnor Ave', type: 'PROPERTY', price: 260, group: 'YELLOW' });
  add({ id: 'water', name: 'Water Works', type: 'UTILITY', price: 150 });
  add({ id: 'mar_ave', name: 'Marvin Gardens', type: 'PROPERTY', price: 280, group: 'YELLOW' });
  
  add({ id: 'go_to_jail', name: 'Go To Jail', type: 'GO_TO_JAIL' });

    // Green
  add({ id: 'pac_ave', name: 'Pacific Ave', type: 'PROPERTY', price: 300, group: 'GREEN' });
  add({ id: 'nc_ave', name: 'North Carolina Ave', type: 'PROPERTY', price: 300, group: 'GREEN' });
  add({ id: 'cc3', name: 'Community Chest', type: 'COMMUNITY_CHEST' });
  add({ id: 'pa_ave', name: 'Pennsylvania Ave', type: 'PROPERTY', price: 320, group: 'GREEN' });
  
  add({ id: 'sl_rr', name: 'Short Line', type: 'RAILROAD', price: 200 });
  
  // Blue
  add({ id: 'park_ave', name: 'Park Place', type: 'PROPERTY', price: 350, group: 'DARK_BLUE' });
  add({ id: 'luxury_tax', name: 'Luxury Tax', type: 'TAX', price: 100 });
  add({ id: 'boardwalk', name: 'Boardwalk', type: 'PROPERTY', price: 400, group: 'DARK_BLUE' });

  return tiles;
};
