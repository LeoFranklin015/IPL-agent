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
  completed: boolean;
  total_bet: number;
  bets: any[];
}

export class MatchStorageTool extends StructuredTool {
  name = "match_storage_tool";
  description = "Stores match data with tweet ID and betting address";
  schema = z.object({
    matchId: z.string(),
    matchName: z.string(),
    tweetId: z.string(),
    bettingAddress: z.string(),
  });

  private readonly storagePath: string;

  constructor() {
    super();
    this.storagePath = path.join(process.cwd(), "data", "matches.json");
    this.ensureStorageFile();
  }

  private ensureStorageFile() {
    const dir = path.dirname(this.storagePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(this.storagePath)) {
      fs.writeFileSync(this.storagePath, JSON.stringify({}, null, 2));
    }
  }

  protected async _call({
    matchId,
    matchName,
    tweetId,
    bettingAddress,
  }: {
    matchId: string;
    matchName: string;
    tweetId: string;
    bettingAddress: string;
  }): Promise<string> {
    try {
      // Initialize data object
      let data: Record<string, MatchData> = {};

      // Try to read existing data
      if (fs.existsSync(this.storagePath)) {
        const fileContent = fs.readFileSync(this.storagePath, "utf8");
        if (fileContent.trim()) {
          data = JSON.parse(fileContent);
        }
      }

      // Create new match data
      const matchData: MatchData = {
        id: matchId,
        name: matchName,
        tweetID: tweetId,
        betting_address: bettingAddress,
        completed: false,
        total_bet: 0,
        bets: [],
      };

      // Store the match data
      data[matchId] = matchData;

      // Write back to file
      fs.writeFileSync(this.storagePath, JSON.stringify(data, null, 2));

      return JSON.stringify({
        success: true,
        message: "Match data stored successfully",
        match: matchData,
      });
    } catch (error) {
      console.error("Error storing match data:", error);
      return JSON.stringify({
        success: false,
        message: "Failed to store match data",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
}
