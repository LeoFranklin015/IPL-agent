import { StructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import axios from "axios";
import { generateAddress } from "@neardefi/shade-agent-js";
import { evm } from "../evm";
import { ethers } from "ethers";

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
  bets: Bet[];
}

interface MatchResult {
  id: string;
  name: string;
  status: string;
  teams: string[];
  matchWinner: string;
  matchEnded: boolean;
}

interface DistributionResult {
  match: string;
  winner: string;
  status: string;
  distribution: {
    totalPool: number;
    platformFee: number;
    totalWinnings: number;
    winners: {
      address: string;
      amount: string;
    }[];
  };
}

export class BetDistributionTool extends StructuredTool {
  name = "bet_distribution_tool";
  description = "Distributes winnings to betters after match completion";
  schema = z.object({});

  private readonly storagePath: string;
  private readonly platformFee: number = 0.001; // 1% platform fee
  private readonly apiKey: string = process.env.CRICAPI_KEY || "";

  constructor() {
    super();
    this.storagePath = path.join(process.cwd(), "data", "matches.json");
  }

  private getActiveMatches(): MatchData[] {
    try {
      const data = JSON.parse(fs.readFileSync(this.storagePath, "utf8"));
      return Object.values(data).filter(
        (match: any) => !match.completed
      ) as MatchData[];
    } catch (error) {
      console.error("Error reading matches:", error);
      return [];
    }
  }

  private async getMatchResult(matchId: string): Promise<MatchResult | null> {
    try {
      const response = await axios.get(
        `https://api.cricapi.com/v1/match_info?apikey=${this.apiKey}&id=${matchId}`
      );

      if (response.data.status === "success") {
        return {
          id: response.data.data.id,
          name: response.data.data.name,
          status: response.data.data.status,
          teams: response.data.data.teams,
          matchWinner: response.data.data.matchWinner,
          matchEnded: response.data.data.matchEnded,
        };
      }
      return null;
    } catch (error) {
      console.error("Error fetching match result:", error);
      return null;
    }
  }

  private calculateWinnings(
    match: MatchData,
    winningTeam: string
  ): { address: string; amount: number }[] {
    const winningBets = match.bets.filter(
      (bet) =>
        bet.is_verified &&
        bet.team_name.toLowerCase() === winningTeam.toLowerCase()
    );

    if (winningBets.length === 0) {
      return [];
    }

    const totalWinningBets = winningBets.reduce(
      (sum, bet) => sum + bet.bet_amount,
      0
    );
    const totalPool = match.total_bet * (1 - this.platformFee);
    const distributionRatio = totalPool / totalWinningBets;

    return winningBets.map((bet) => ({
      address: bet.better_address,
      amount: bet.bet_amount * distributionRatio,
    }));
  }

  protected async _call(): Promise<string> {
    try {
      const activeMatches = this.getActiveMatches();
      console.log(`Found ${activeMatches.length} active matches to check`);

      const results: DistributionResult[] = [];
      const data = JSON.parse(fs.readFileSync(this.storagePath, "utf8"));

      for (const match of activeMatches) {
        console.log(`Checking match: ${match.name}`);
        const matchResult = await this.getMatchResult(match.id);

        if (!matchResult) {
          console.log(`Could not fetch result for match: ${match.name}`);
          continue;
        }

        if (!matchResult.matchEnded) {
          console.log(`Match ${match.name} has not ended yet`);
          continue;
        }

        // Calculate winnings
        const winnings = this.calculateWinnings(match, matchResult.matchWinner);

        // Send winnings to betters
        for (const winner of winnings) {
          const { address } = await generateAddress({
            publicKey:
              "secp256k1:4NfTiv3UsGahebgTaHyD9vF8KYKMBnfd6kh94mK6xv8fGBiJB8TBtFMP5WWXz6B89Ac1fbpzPwAvoyQebemHFwx3",
            accountId: "based-names-contract.testnet",
            path: match.id,
            chain: "evm",
          });

          console.log("sending", winner.amount, "to", winner.address);
          await evm.send({
            path: matchResult.id,
            to: winner.address,
            from: address,
            amount: winner.amount.toString(),
            gasLimit: 21000n,
          });
        }

        // Update match status
        data[match.id].completed = true;
        fs.writeFileSync(this.storagePath, JSON.stringify(data, null, 2));

        results.push({
          match: match.name,
          winner: matchResult.matchWinner,
          status: matchResult.status,
          distribution: {
            totalPool: match.total_bet,
            platformFee: match.total_bet * this.platformFee,
            totalWinnings: match.total_bet * (1 - this.platformFee),
            winners: winnings.map((win) => ({
              address: win.address,
              amount: win.amount.toFixed(6),
            })),
          },
        });

        console.log(`Processed match: ${match.name}`);
      }

      return JSON.stringify({
        success: true,
        message: "Processed all active matches",
        results,
      });
    } catch (error) {
      console.error("Error processing matches:", error);
      return JSON.stringify({
        success: false,
        message: "Failed to process matches",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
}
