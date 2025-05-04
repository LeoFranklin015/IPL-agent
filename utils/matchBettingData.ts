export interface Bet {
  better_tweet_name: string;
  better_address: string;
  bet_amount: number;
  team_name: string;
}

export interface MatchBettingData {
  id: string;
  name: string;
  tweetID?: string;
  total_bet: number;
  bets: Bet[];
}

// Store all match betting data
export const matchBettingData: Record<string, MatchBettingData> = {};

// Initialize betting data for all matches
export function initializeMatchBettingData() {
  const matchList = require("./matchData").matchList;

  matchList.forEach((match: any) => {
    matchBettingData[match.id] = {
      id: match.id,
      name: match.name,
      tweetID: undefined,
      total_bet: 0,
      bets: [],
    };
  });
}
