# IPL BetBot

## Project Overview
**IPL BetBot** is a conversational prediction market agent built for the Shade Agents Hackathon using the **ShadeAgent framework** and **Coinbase Developer Platform's Twitter (X) AgentKit**. Users bet on Indian Premier League (IPL) matches by tagging `@ideamanpaul` on X with their team choice, ETH amount, and wallet address. Each match has a unique on-chain vault (chain signature account) on Base, and a worker agent resolves outcomes via an API, distributing winnings automatically.

### Key Features
- **Conversational Betting**: Tag `@ideamanpaul` on X to bet (e.g., "@ideamanpaul 0.01 ETH on CSK from 0x4b4b...").
- **On-Chain Vaults**: A unique wallet address per match secures the betting pool.
- **Automated Resolution**: A worker agent calls an API to determine the winner and distributes winnings based on bet shares.
- **Seamless Workflow**:
  1. Bot posts match details and a unique Base address.
  2. Users bet by tagging the bot.
  3. Bot listens for transaction success and confirms.
  4. Worker resolves the market and distributes winnings.
  5. Bot posts the next match.
- **Tools Used**:
  - `twitter_mention_tool`: Handles mentions/replies.
  - `match_content_tool`: Fetches match details.
  - `match_storage_tool`: Stores match data (tweet ID, betting address).
  - `bet_processing_tool`: Processes bets.
  - `mention_processing_tool`: Tracks processed mentions.
  - `bet_distribution_tool`: Distributes winnings.

### Demo

https://youtu.be/cmX8qwF6MfA

The demo shows the bot posting a match, processing a bet, confirming a transaction, and resolving payouts.

## How It Works
1. **Match Announcement**:
   - Bot posts match details (e.g., "KKR vs CSK, 57th Match. Bet now! Tag @ideamanpaul with team, ETH, & address. Send to: 0xc392... on Base").
   - A unique wallet is generated for the match using a chain signature account.

2. **Placing Bets**:
   - Users tag the bot (e.g., "@ideamanpaul I’m betting 0.01 ETH on CSK from 0x4b4b30e2...").
   - Users send ETH to the match’s Base address (optionally via `@bankrbot` or directly).

3. **Transaction Confirmation**:
   - Bot uses `bet_processing_tool` to listen for transaction success and replies with a confirmation (e.g., "Bet confirmed! Tx: [explorer link]").

4. **Market Resolution**:
   - Post-match, the worker agent calls an API to get the winner.
   - Using `bet_distribution_tool`, it distributes winnings to bettors based on their investment share via the chain signature account.

5. **Next Match**:
   - Bot posts details for the next IPL match, starting the cycle again.
