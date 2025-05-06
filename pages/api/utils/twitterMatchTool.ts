import { TwitterApi } from "twitter-api-v2";
import { generateMatchPredictionTweet } from "./tweetGenerator";
import { matchBettingData } from "./matchBettingData";
import { StructuredTool, Tool } from "@langchain/core/tools";
import { matchList } from "./matchData";
import { z } from "zod";

export class TwitterMatchTool extends StructuredTool {
  name = "twitter_match_tool";
  description =
    "A tool for posting match predictions on Twitter and managing match betting data";
  schema = z.object({});
  private client: TwitterApi;

  constructor(client: TwitterApi) {
    super();
    this.client = client;
  }

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
        return "No upcoming matches found for prediction.";
      }

      // Check if this match has already been posted
      if (matchBettingData[nextMatch.id]?.tweetID) {
        return `Match ${nextMatch.name} has already been posted. Tweet ID: ${
          matchBettingData[nextMatch.id].tweetID
        }`;
      }

      // Generate the tweet content
      const tweetContent = generateMatchPredictionTweet();
      console.log(tweetContent);

      // Post the tweet using v2 API with proper OAuth 1.0a User Context
      const tweet = await this.client.v2.tweet(
        "Kolkata Knight Riders vs Rajasthan Royals, 53rd Match Kolkata Knight Riders vs Rajasthan Royals. Bet on your team!"
      );

      // Update the match betting data
      if (!matchBettingData[nextMatch.id]) {
        matchBettingData[nextMatch.id] = {
          id: nextMatch.id,
          name: nextMatch.name,
          tweetID: tweet.data.id,
          total_bet: 0,
          bets: [],
        };
      } else {
        matchBettingData[nextMatch.id].tweetID = tweet.data.id;
      }

      return `Successfully posted match prediction tweet for ${nextMatch.name} with ID: ${tweet.data.id}`;
    } catch (error) {
      console.error("Error posting match prediction:", error);
      return "Failed to post match prediction tweet";
    }
  }
}
