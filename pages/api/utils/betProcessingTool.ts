import { StructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";

interface Bet {
  better_tweet_name: string;
  better_address: string;
  bet_amount: number;
  team_name: string;
  is_verified: boolean;
}

interface MatchData {
  id: string;
  name: string;
  tweetID: string;
  betting_address: string;
  total_bet: number;
  bets: Bet[];
}

export class BetProcessingTool extends StructuredTool {
  name = "bet_processing_tool";
  description = "Processes bets from mentions and updates match data";
  schema = z.object({
    team: z.string(),
    address: z.string(),
    amount: z.number(),
    mentionerName: z.string(),
  });

  private readonly storagePath: string;

  constructor() {
    super();
    this.storagePath = path.join(process.cwd(), "data", "matches.json");
  }

  private async findMatchByTeam(teamName: string): Promise<MatchData | null> {
    try {
      const data = JSON.parse(fs.readFileSync(this.storagePath, "utf8"));
      // Find the most recent match that includes this team
      const matches = Object.values(data).filter((match: any) =>
        match.name.toLowerCase().includes(teamName.toLowerCase())
      );

      if (matches.length === 0) {
        return null;
      }

      // Return the most recent match (assuming matches are stored with most recent first)
      return matches[0] as MatchData;
    } catch (error) {
      console.error("Error finding match:", error);
      return null;
    }
  }

  protected async _call({
    team,
    address,
    amount,
    mentionerName,
  }: {
    team: string;
    address: string;
    amount: number;
    mentionerName: string;
  }): Promise<string> {
    try {
      // Find the match by team name
      const match = await this.findMatchByTeam(team);
      if (!match) {
        return JSON.stringify({
          success: false,
          message: `No active match found for team: ${team}`,
        });
      }

      // Create new bet
      const newBet: Bet = {
        better_tweet_name: mentionerName,
        better_address: address,
        bet_amount: amount,
        team_name: team,
        is_verified: false, // Initially unverified
      };

      // Update match data
      const data = JSON.parse(fs.readFileSync(this.storagePath, "utf8"));
      const matchData = data[match.id];

      matchData.bets.push(newBet);
      matchData.total_bet += amount;

      // Save updated data
      fs.writeFileSync(this.storagePath, JSON.stringify(data, null, 2));

      return JSON.stringify({
        success: true,
        message: `Successfully processed bet for ${match.name}`,
        bet: newBet,
        match: matchData,
      });
    } catch (error) {
      console.error("Error processing bet:", error);
      return JSON.stringify({
        success: false,
        message: "Failed to process bet",
      });
    }
  }
}
