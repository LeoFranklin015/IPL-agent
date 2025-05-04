import { TwitterApi } from "twitter-api-v2";

interface MentionResult {
  newMentions: Array<{
    id: string;
    text: string;
    author_id: string;
    created_at: string;
  }>;
  latestTimestamp: number;
}

export async function processMentions(
  client: TwitterApi,
  lastProcessedTimestamp: number
): Promise<MentionResult> {
  try {
    // Get the bot's user ID
    const me = await client.v2.me();
    const botUserId = me.data.id;

    // Get mentions since the last processed timestamp
    const mentions = await client.v2.userMentionTimeline(botUserId, {
      start_time: new Date(lastProcessedTimestamp).toISOString(),
      max_results: 1,
      "tweet.fields": ["created_at", "author_id", "text", "conversation_id"],
    });

    const newMentions = (mentions.data?.data || []).map((tweet) => ({
      id: tweet.id,
      text: tweet.text,
      author_id: tweet.author_id || "",
      created_at: tweet.created_at || new Date().toISOString(),
    }));

    const latestTimestamp =
      newMentions.length > 0
        ? new Date(newMentions[0].created_at).getTime()
        : lastProcessedTimestamp;

    return {
      newMentions,
      latestTimestamp,
    };
  } catch (error) {
    console.error("Error processing mentions:", error);
    throw error;
  }
}

export async function replyToMention(
  client: TwitterApi,
  tweetId: string,
  replyText: string
): Promise<void> {
  try {
    await client.v2.reply(replyText, tweetId);
  } catch (error) {
    console.error("Error replying to mention:", error);
    throw error;
  }
}
