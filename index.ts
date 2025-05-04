import { TwitterToolkit } from "@coinbase/twitter-langchain";
import { TwitterAgentkit } from "@coinbase/cdp-agentkit-core";
import { HumanMessage } from "@langchain/core/messages";
import { MemorySaver } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import * as dotenv from "dotenv";
import * as readline from "readline";
import { TwitterMentionTool } from "./twitter-mention-tool";
import { TwitterApi } from "twitter-api-v2";
import { TwitterMatchTool } from "./utils/twitterMatchTool";
import { initializeMatchBettingData } from "./utils/matchBettingData";
import { MatchContentTool } from "./utils/matchContentTool";
import { MatchStorageTool } from "./utils/matchStorageTool";
import { BetProcessingTool } from "./utils/betProcessingTool";
import { BetTransactionListener } from "./utils/betTransactionListener";
import { BetDistributionTool } from "./utils/betDistributionTool";
dotenv.config();

const modifier = `
  You are a helpful agent that can interact with the Twitter (X) API using the Coinbase Developer Platform Twitter (X) Agentkit.
  You are empowered to interact with Twitter (X) using your tools.

  Available tools:
  1. twitter_mention_tool: Use this to handle mentions and replies
  2. match_content_tool: Use this to get the content of a match
  3. match_storage_tool: Use this to store match betting data
  4. bet_processing_tool: Use this to process bets from mentions
  5. mention_processing_tool: Use this to track processed mentions

  When asked to create a tweet about the next match, follow these steps:
  1. First, use match_content_tool to get the match details and tweet content
  2. Then, use the Twitter API to post the tweet
  3. Finally, use match_storage_tool to store the match data with the tweet ID and betting address

  When processing mentions about bets, follow these steps:

  1. Use bet_processing_tool to process the bet and update the match data if its not already processed and store the bet data in the match data
  2. Reply to the mention with confirmation

  When a match is completed, use bet_distribution_tool to distribute the winnings to the betters

  Always be helpful and provide clear responses to user queries.
`;

/**
 * Initialize the agent with Twitter (X) Agentkit
 *
 * @returns Agent executor and config
 */
async function initialize() {
  // Initialize LLM
  const llm = new ChatOpenAI({ model: "gpt-4o-mini" });

  // Twitter (X) Agentkit
  const twitterAgentkit = new TwitterAgentkit();

  // Twitter (X) Toolkit
  const twitterToolkit = new TwitterToolkit(twitterAgentkit);

  // Initialize Twitter API client with OAuth 1.0a User Context
  const client = new TwitterApi({
    appKey: process.env.TWITTER_API_KEY || "",
    appSecret: process.env.TWITTER_API_SECRET || "",
    accessToken: process.env.TWITTER_ACCESS_TOKEN || "",
    accessSecret: process.env.TWITTER_ACCESS_SECRET || "",
  });

  // Create tools
  const mentionTool = new TwitterMentionTool(client);
  const matchContentTool = new MatchContentTool();
  const matchStorageTool = new MatchStorageTool();
  const betProcessingTool = new BetProcessingTool();
  const betDistributionTool = new BetDistributionTool();

  // Create TwitterMatchTool
  const matchTool = new TwitterMatchTool(client);

  // Initialize match betting data
  initializeMatchBettingData();

  // Get all tools
  const tools: any[] = [
    ...twitterToolkit.getTools(),
    mentionTool,
    matchContentTool,
    matchStorageTool,
    betProcessingTool,
    betDistributionTool,
  ];

  // Store buffered conversation history in memory
  const memory = new MemorySaver();

  // React Agent options
  const agentConfig = {
    configurable: { thread_id: "Twitter Agentkit Chatbot Example!" },
  };

  // Create React Agent using the LLM and Twitter (X) tools
  const agent = createReactAgent({
    llm,
    tools,
    checkpointSaver: memory,
    messageModifier: modifier,
  });

  return { agent, config: agentConfig };
}

/**
 * Run the agent autonomously with specified intervals
 *
 * @param agent - The agent executor
 * @param config - Agent configuration
 * @param interval - Time interval between actions in seconds
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runAutonomousMode(agent: any, config: any, interval = 10) {
  console.log("Starting autonomous mode...");

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const thought =
        "Be creative and do something interesting on the blockchain. " +
        "Choose an action or set of actions and execute it that highlights your abilities.";

      const stream = await agent.stream(
        { messages: [new HumanMessage(thought)] },
        config
      );

      for await (const chunk of stream) {
        if ("agent" in chunk) {
          console.log(chunk.agent.messages[0].content);
        } else if ("tools" in chunk) {
          console.log(chunk.tools.messages[0].content);
        }
        console.log("-------------------");
      }

      await new Promise((resolve) => setTimeout(resolve, interval * 1000));
    } catch (error) {
      if (error instanceof Error) {
        console.error("Error:", error.message);
      }
      process.exit(1);
    }
  }
}

/**
 * Run the agent interactively based on user input
 *
 * @param agent - The agent executor
 * @param config - Agent configuration
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runChatMode(agent: any, config: any) {
  console.log("Starting chat mode... Type 'exit' to end.");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> =>
    new Promise((resolve) => rl.question(prompt, resolve));

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const userInput = await question("\nPrompt: ");

      if (userInput.toLowerCase() === "exit") {
        break;
      }

      const stream = await agent.stream(
        { messages: [new HumanMessage(userInput)] },
        config
      );

      for await (const chunk of stream) {
        if ("agent" in chunk) {
          console.log(chunk.agent.messages[0].content);
        } else if ("tools" in chunk) {
          console.log(chunk.tools.messages[0].content);
        }
        console.log("-------------------");
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error("Error:", error.message);
    }
    process.exit(1);
  } finally {
    rl.close();
  }
}

/**
 * Choose whether to run in autonomous or chat mode based on user input
 *
 * @returns Selected mode
 */
async function chooseMode(): Promise<"chat" | "auto"> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> =>
    new Promise((resolve) => rl.question(prompt, resolve));

  // eslint-disable-next-line no-constant-condition
  while (true) {
    console.log("\nAvailable modes:");
    console.log("1. chat    - Interactive chat mode");
    console.log("2. auto    - Autonomous action mode");

    const choice = (await question("\nChoose a mode (enter number or name): "))
      .toLowerCase()
      .trim();

    if (choice === "1" || choice === "chat") {
      rl.close();
      return "chat";
    } else if (choice === "2" || choice === "auto") {
      rl.close();
      return "auto";
    }
    console.log("Invalid choice. Please try again.");
  }
}

/**
 * Start the chatbot agent
 */
async function main() {
  try {
    const { agent, config } = await initialize();
    const listener = new BetTransactionListener();
    listener.startListening();
    const mode = await chooseMode();

    if (mode === "chat") {
      await runChatMode(agent, config);
    } else {
      await runAutonomousMode(agent, config);
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error("Error:", error.message);
    }
    process.exit(1);
  }
}

if (require.main === module) {
  console.log("Starting Agent...");
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
