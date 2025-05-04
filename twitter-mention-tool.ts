import { StructuredTool } from "langchain/tools";
import { TwitterApi } from "twitter-api-v2";
import { processMentions, replyToMention } from "./utils/twitter-client";
import { z } from "zod";

export class TwitterMentionTool extends StructuredTool {
  name = "twitter_mention_tool";
  description = "Process new Twitter mentions and reply to them";
  schema = z.object({
    action: z.enum(["process", "reply"]),
    tweetId: z.string().optional().nullable(),
    replyText: z.string().optional().nullable(),
  });

  private client: TwitterApi;
  private lastProcessedTimestamp: number;

  constructor(client: TwitterApi, lastProcessedTimestamp: number = 0) {
    super();
    this.client = client;
    this.lastProcessedTimestamp = lastProcessedTimestamp;
  }

  async _call({
    action,
    tweetId,
    replyText,
  }: {
    action: string;
    tweetId?: string;
    replyText?: string;
  }) {
    try {
      if (action === "process") {
        const result = await processMentions(
          this.client,
          this.lastProcessedTimestamp
        );
        this.lastProcessedTimestamp = result.latestTimestamp;

        if (result.newMentions.length > 0) {
          return `Found ${result.newMentions.length} new mentions. Latest timestamp: ${this.lastProcessedTimestamp}`;
        } else {
          return "No new mentions found.";
        }
      } else if (action === "reply" && tweetId && replyText) {
        const response = await replyToMention(this.client, tweetId, replyText);
        return `Successfully replied to tweet ${tweetId} with this ${response}`;
      } else {
        throw new Error("Invalid action or missing parameters");
      }
    } catch (error) {
      console.error("Error in TwitterMentionTool:", error);
      throw error;
    }
  }
}
