export async function getConversationId(client, tweetId) {
  try {
    const tweet = await client.v2.singleTweet(tweetId, {
      "tweet.fields": "conversation_id",
    });
    return tweet.data.conversation_id;
  } catch (e) {
    console.log("ERROR getConversationId", e);
  }
  return null;
}

export async function getLatestConversationTweet(client, conversationId) {
  try {
    const searchResult = await client.v2.search(
      `conversation_id:${conversationId}`,
      {
        "tweet.fields": "created_at",
        max_results: 100, // Adjust based on needs
      }
    );
    if (searchResult?.data?.meta?.result_count === 0) {
      return null;
    }

    return searchResult.data.data[0]; // Most recent tweet is first
  } catch (e) {
    console.log("ERROR getLatestConversationTweet", e);
  }
  return null;
}

export async function processMentions(client, lastProcessedTimestamp = 0) {
  try {
    const start_time =
      lastProcessedTimestamp > 0
        ? new Date(lastProcessedTimestamp * 1000 + 1000).toISOString()
        : undefined;

    const tweetGenerator = await client.v2.search("@radish57074", {
      start_time,
      "tweet.fields": "author_id,created_at,referenced_tweets",
    });

    const newMentions = [];
    let latestTimestamp = lastProcessedTimestamp;

    for await (const tweet of tweetGenerator) {
      const tweetTimestamp = new Date(tweet.created_at).getTime() / 1000;

      // Skip if we've already processed this tweet
      if (tweetTimestamp <= lastProcessedTimestamp) {
        continue;
      }

      // Update latest timestamp
      if (tweetTimestamp > latestTimestamp) {
        latestTimestamp = tweetTimestamp;
      }

      // Add to new mentions
      newMentions.push({
        id: tweet.id,
        text: tweet.text,
        author_id: tweet.author_id,
        created_at: tweet.created_at,
        timestamp: tweetTimestamp,
      });
    }

    return {
      newMentions,
      latestTimestamp,
    };
  } catch (error) {
    console.error("Error processing mentions:", error);
    throw error;
  }
}

export async function replyToMention(client, tweetId, replyText) {
  try {
    const response = await client.v2.reply(replyText, tweetId);
    return response;
  } catch (error) {
    console.error("Error replying to mention:", error);
    throw error;
  }
}
