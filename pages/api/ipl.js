import { generateAddress, networkId } from "@neardefi/shade-agent-js";
import { matchList } from "../../data/matchList";
import { createPublicClient, webSocket } from "viem";
import { baseSepolia } from "viem/chains";
import { TwitterApi } from "twitter-api-v2";
import { fetchJson, sleep } from "../../utils/utils";

const pendingMatches = new Map();
const MatchWallets = new Map();
const MatchBets = new Map();

// Search related constants
const REPLY_PROCESSING_DELAY = 15000;
const pendingReply = [];
let lastTweetTimestamp = parseInt(process.env.TWITTER_LAST_TIMESTAMP || "0");
let waitingForReset = 0;

// Twitter client initialization
let twitterClient = null;
let accessToken = process.env.TWITTER_ACCESS_TOKEN;
let refreshToken = process.env.TWITTER_REFRESH_TOKEN;

const viemClient = createPublicClient({
  chain: baseSepolia,
  transport: webSocket(
    "wss://base-sepolia.g.alchemy.com/v2/6unFRgRqxklQkmPxSBhd2WE9aMV5ffMY"
  ),
});

const postTweet = async (tweetText) => {
  const options = {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.TWITTER_BEARER_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: tweetText,
      for_super_followers_only: false,
      nullcast: false,
    }),
  };

  try {
    console.log(
      "Posting tweet with options:",
      JSON.stringify(options, null, 2)
    );
    const res = await fetch("https://api.twitter.com/2/tweets", options);
    if (!res.ok) {
      const errorData = await res.json();
      console.error("Twitter API Error:", errorData);
      throw new Error(
        `Twitter API error: ${errorData.detail || res.statusText}`
      );
    }
    const data = await res.json();
    console.log("Tweet Response:", data);

    return data;
  } catch (err) {
    console.error("Error posting tweet:", err);
    throw err;
  }
};

// // Function to get today's matches
const getTodaysMatches = () => {
  const today = new Date().toISOString().split("T")[0]; // Get today's date in YYYY-MM-DD format
  return matchList.filter(
    (match) => match.date === today && !match.matchStarted
  );
};

// Function to generate wallet address for a team
const generateTeamWallet = async (matchId, teamName) => {
  const path = `${matchId}${teamName}`;
  const { address } = await generateAddress({
    publicKey:
      networkId === "testnet"
        ? process.env.MPC_PUBLIC_KEY_TESTNET
        : process.env.MPC_PUBLIC_KEY_MAINNET,
    accountId: process.env.NEXT_PUBLIC_contractId,
    path,
    chain: "evm",
  });
  console.log("generateTeamWallet", address);
  return address;
};

// Function to format match details for tweet
const formatMatchTweet = (match, teamWallets) => {
  const [team1, team2] = match.teams;
  const team1Wallet = teamWallets[team1];
  const team2Wallet = teamWallets[team2];

  return `IPL Match Alert! ${team1} vs ${team2} ${
    match.venue
  } ${match.dateTimeGMT
    .split("T")[1]
    .slice(
      0,
      5
    )} GMT Place your bets by sending funds to: ${team1}: ${team1Wallet} ${team2}: ${team2Wallet} #IPL2025 #Cricket #Bettingg`;
};

// Function to refresh access token
const refreshAccessToken = async () => {
  console.log("Refreshing access token");
  const client = new TwitterApi({
    clientId: process.env.TWITTER_CLIENT_KEY,
    clientSecret: process.env.TWITTER_CLIENT_SECRET,
  });
  try {
    const { accessToken: newAccessToken, refreshToken: newRefreshToken } =
      await client.refreshOAuth2Token(refreshToken);
    accessToken = newAccessToken;
    refreshToken = newRefreshToken;
    console.log("Successfully refreshed access token");
  } catch (error) {
    console.error("Error refreshing access token:", error);
    throw error;
  }
};

// Function to initialize Twitter client
const initializeTwitterClient = async () => {
  if (!twitterClient) {
    try {
      twitterClient = new TwitterApi(accessToken);
      // Test the token by making a simple API call
      await twitterClient.v2.me();
    } catch (error) {
      if (error.code === 401) {
        // Token expired, refresh it
        await refreshAccessToken();
        twitterClient = new TwitterApi(accessToken);
      } else {
        throw error;
      }
    }
  }
  return twitterClient;
};

// Function to process replies (dummy implementation)
const processReplies = async () => {
  const tweet = pendingReply.shift();
  if (!tweet || tweet.replyAttempt >= 3) {
    await sleep(REPLY_PROCESSING_DELAY);
    processReplies();
    return;
  }
  console.log("Processing reply for tweet:", tweet.id);

  // Dummy reply implementation
  try {
    const replyText = `Thank you for your interest in IPL betting! Please check our latest match updates.`;
    await postTweet(replyText);
    console.log("Successfully replied to tweet:", tweet.id);
  } catch (error) {
    console.error("Error replying to tweet:", error);
    if (error.code === 401) {
      // Token expired, refresh it and retry
      await refreshAccessToken();
      twitterClient = new TwitterApi(accessToken);
      tweet.replyAttempt++;
      pendingReply.push(tweet);
    } else {
      tweet.replyAttempt++;
      pendingReply.push(tweet);
    }
  }

  await sleep(REPLY_PROCESSING_DELAY);
  processReplies();
};

// Start the reply processing loop
processReplies();

// Main function to post daily matches
export default async function handler(req, res) {
  try {
    // Handle search endpoint
    if (req.query.call === "search") {
      await initializeTwitterClient();

      // Rate limited?
      if (waitingForReset !== 0 && Date.now() / 1000 < waitingForReset) {
        return res.status(429).json({ error: "Rate limited" });
      }
      waitingForReset = 0;

      // Search for tweets
      const start_time =
        lastTweetTimestamp > 0
          ? new Date(lastTweetTimestamp * 1000 + 1000).toISOString()
          : undefined;

      console.log("Search start_time:", start_time);
      const tweetGenerator = await twitterClient.v2.search("@radish57074", {
        start_time,
        "tweet.fields": "author_id,created_at,referenced_tweets",
      });

      // Check rate limits
      console.log("REMAINING API CALLS", tweetGenerator._rateLimit.remaining);
      console.log(
        "RESET",
        Number(
          (tweetGenerator._rateLimit.reset - Date.now() / 1000) / 60
        ).toPrecision(4) + " minutes"
      );

      if (tweetGenerator._rateLimit.remaining <= 0) {
        waitingForReset = tweetGenerator._rateLimit.reset;
      }

      let seen = 0;
      const limit = 99;
      let latestValidTimestamp = 0;

      for await (const tweet of tweetGenerator) {
        if (++seen > limit) break;

        tweet.timestamp = new Date(tweet.created_at).getTime() / 1000;

        // Skip if already in pending state
        if (pendingReply.findIndex((t) => t.id === tweet.id) > -1) {
          continue;
        }

        // Skip if we've seen it before
        if (tweet.timestamp <= lastTweetTimestamp) {
          continue;
        }

        if (latestValidTimestamp === 0) {
          latestValidTimestamp = tweet.timestamp;
        }

        // Add to pending replies
        tweet.replyAttempt = 0;
        pendingReply.push(tweet);
      }

      // Update last tweet timestamp
      if (latestValidTimestamp > 0) {
        lastTweetTimestamp = latestValidTimestamp;
      }

      return res.status(200).json({
        success: true,
        pendingReplies: pendingReply.length,
        lastTweetTimestamp,
      });
    }

    // Original IPL match posting logic
    const todaysMatches = getTodaysMatches();

    if (todaysMatches.length === 0) {
      return res
        .status(200)
        .json({ message: "No matches scheduled for today" });
    }

    // Generate wallet addresses for each team in today's matches

    // Format and post tweet for each match
    for (const match of todaysMatches) {
      const teamWallets = {};
      for (const team of match.teams) {
        if (!teamWallets[team]) {
          teamWallets[team] = await generateTeamWallet(match.id, team);
        }
      }

      MatchWallets.set(match.id, teamWallets);

      const tweetText = formatMatchTweet(match, teamWallets);

      // Post tweet with retry on auth failure
      const tweet = await postTweet(tweetText);
      pendingMatches.set(match.id, tweet.data.id);
      console.log("pendingMatches", pendingMatches);
      console.log("MatchWallets", MatchWallets);
      // const monitoredAddress =
      //   "0x91a3a978839548fa6557ecbe6d3de70239173637".toLowerCase();

      // // viemClient.watchBlocks({
      // //   includeTransactions: true,
      // //   onBlock: (block) => {
      // //     for (const tx of block.transactions) {
      // //       if (
      // //         tx.to &&
      // //         tx.to.toLowerCase() === monitoredAddress &&
      // //         BigInt(tx.value) > 0n
      // //       ) {
      // //         console.log(`💸 Incoming ETH:
      // //   From: ${tx.from}
      // //   Value: ${Number(tx.value) / 1e18} ETH
      // //   TxHash: ${tx.hash}
      // // `);
      // //       }
      // //     }
      // //   },
      // // });

      console.log(`Posted tweet for match: ${match.name}`);
    }

    res.status(200).json({
      success: true,
      matchesPosted: todaysMatches.length,
    });
  } catch (error) {
    console.error("Error posting IPL matches:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
