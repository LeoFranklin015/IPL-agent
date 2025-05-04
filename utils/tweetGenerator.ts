import { matchList } from "./matchData";

export function generateMatchPredictionTweet(): string {
  const today = new Date().toISOString().split("T")[0];
  const todaysMatches = matchList.filter(
    (match) => match.date === today && !match.matchStarted
  );

  if (todaysMatches.length === 0) {
    return "No matches scheduled for today.";
  }

  const match = todaysMatches[0];
  const teams = match.teams.join(" vs ");
  const matchName = match.name;
  const bettingAddress = "0x69842t2...626"; // Replace with actual address

  return `${matchName} ${teams}. Bet on your team! Tag me with your address, team choice, and ETH amount. Send to: ${bettingAddress}`;
}
