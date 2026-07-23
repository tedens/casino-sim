import { PointNumber, Ruleset } from './types';

export const BELLAGIO_RULESET: Ruleset = {
  id: 'bellagio-standard-345',
  name: 'Bellagio Standard 3-4-5×',
  tableMinimum: 5,
  tableMaximum: 5000,
  startingBankroll: 5000,
  passOddsMultiples: { 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3 },
  dontOddsMultiple: 6,
  fieldTwo: 2,
  fieldTwelve: 3,
  commissionRate: 0.05,
  commissionOnWinOnly: true,
};

export const TRUE_ODDS: Record<PointNumber, [number, number]> = {
  4: [2, 1],
  5: [3, 2],
  6: [6, 5],
  8: [6, 5],
  9: [3, 2],
  10: [2, 1],
};

export const LAY_ODDS: Record<PointNumber, [number, number]> = {
  4: [1, 2],
  5: [2, 3],
  6: [5, 6],
  8: [5, 6],
  9: [2, 3],
  10: [1, 2],
};

export const PLACE_ODDS: Record<PointNumber, [number, number]> = {
  4: [9, 5],
  5: [7, 5],
  6: [7, 6],
  8: [7, 6],
  9: [7, 5],
  10: [9, 5],
};

export const HARDWAY_ODDS: Partial<Record<PointNumber, number>> = {
  4: 7,
  6: 9,
  8: 9,
  10: 7,
};
