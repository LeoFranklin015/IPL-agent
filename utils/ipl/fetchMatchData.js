import { matchList } from "../../data/matchList";

export const fetchMatchData = async (matchId) => {
  const match = matchList.find((match) => match.id === matchId);
  return match;
};

export const fetchMatchWallets = async (matchId) => {
  const match = matchList.find((match) => match.id === matchId);
  return match;
};
