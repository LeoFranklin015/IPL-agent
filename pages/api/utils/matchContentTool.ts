import { StructuredTool } from "@langchain/core/tools";
import { matchList } from "./matchData";
import { z } from "zod";
import { generateAddress } from "@neardefi/shade-agent-js";

export class MatchContentTool extends StructuredTool {
  name = "match_content_tool";
  description = "Finds the next match and generates tweet content for it";
  schema = z.object({}) as any; // Type assertion to avoid TypeScript error

  private getNextMatch() {
    const today = new Date().toISOString().split("T")[0]; // Get today's date in YYYY-MM-DD format

    // Find the next match that is scheduled for today and hasn't started
    const nextMatch = matchList.find((match) => {
      return (
        match.date === today &&
        !match.matchStarted &&
        !match.matchEnded &&
        match.teams[0] !== "Tbc" &&
        match.teams[1] !== "Tbc"
      );
    });

    return nextMatch;
  }

  protected async _call(input: string): Promise<string> {
    try {
      const nextMatch = this.getNextMatch();

      if (!nextMatch) {
        return JSON.stringify({
          success: false,
          message: "No upcoming matches found for prediction.",
          nextSteps:
            "Please try again later or check if there are any matches scheduled for today.",
        });
      }

      const teams = nextMatch.teams.join(" vs ");
      const matchName = nextMatch.name;
      const { address } = await generateAddress({
        publicKey:
          "secp256k1:4NfTiv3UsGahebgTaHyD9vF8KYKMBnfd6kh94mK6xv8fGBiJB8TBtFMP5WWXz6B89Ac1fbpzPwAvoyQebemHFwx3",
        accountId: "cultured-owner.testnet",
        path: nextMatch.id,
        chain: "evm",
      });

      const tweetContent = `${matchName} ${teams}. Bet on your team! Tag me with your address, team choice, and ETH amount. Send to: ${address}`;

      return JSON.stringify({
        success: true,
        matchId: nextMatch.id,
        matchName: nextMatch.name,
        tweetContent: tweetContent,
        bettingAddress: address,
        nextSteps:
          "Now you can post this tweet using the Twitter API and then store the data using match_storage_tool with the tweet ID and betting address.",
      });
    } catch (error) {
      console.error("Error generating match content:", error);
      return JSON.stringify({
        success: false,
        message: "Failed to generate match content",
        nextSteps: "Please try again or check the error logs for more details.",
      });
    }
  }
}
