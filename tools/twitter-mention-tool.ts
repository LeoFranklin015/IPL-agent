import { StructuredTool } from "langchain/tools";
import { TwitterApi } from "twitter-api-v2";
import { processMentions, replyToMention } from "../utils/twitter-client";

export class TwitterMentionTool extends StructuredTool {
  name = "twitter_mention_tool";
  description = "Process new Twitter mentions and reply to them";
  schema = {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["process", "reply"],
        description:
          "The action to perform: 'process' to get new mentions, 'reply' to reply to a specific mention",
      },
      tweetId: {
        type: "string",
        description:
          "The ID of the tweet to reply to (required for 'reply' action)",
      },
      replyText: {
        type: "string",
        description: "The text to reply with (required for 'reply' action)",
      },
    },
    required: ["action"],
  };

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
        return `Successfully replied to tweet ${tweetId}`;
      } else {
        throw new Error("Invalid action or missing parameters");
      }
    } catch (error) {
      console.error("Error in TwitterMentionTool:", error);
      throw error;
    }
  }
}
