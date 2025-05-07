import { createPublicClient, webSocket } from "viem";
import { baseSepolia } from "viem/chains";
import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";
dotenv.config();

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

export class BetTransactionListener {
  private readonly storagePath: string;
  private readonly viemClient: any;
  private isListening: boolean = false;
  private unwatch: (() => void) | null = null;

  constructor() {
    this.storagePath = path.join(process.cwd(), "data", "matches.json");
    this.viemClient = createPublicClient({
      chain: baseSepolia,
      transport: webSocket(
        `wss://base-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
      ),
    });
    console.log("BetTransactionListener initialized with Base Sepolia network");
  }

  private getActiveMatches(): MatchData[] {
    try {
      const data = JSON.parse(fs.readFileSync(this.storagePath, "utf8"));
      const activeMatches = Object.values(data).filter(
        (match: any) => !match.completed
      ) as MatchData[];
      console.log(`Found ${activeMatches.length} active matches`);
      activeMatches.forEach((match) => {
        console.log(`Active match: ${match.name} (${match.betting_address})`);
      });
      return activeMatches;
    } catch (error) {
      console.error("Error reading matches:", error);
      return [];
    }
  }

  private updateBetVerification(
    toAddress: string,
    betterAddress: string,
    txHash: string
  ) {
    try {
      const data = JSON.parse(fs.readFileSync(this.storagePath, "utf8"));
      const match = data.find(
        (match: any) =>
          match.betting_address.toLowerCase() === toAddress.toLowerCase()
      );

      if (match) {
        const bet = match.bets.find(
          (b: Bet) =>
            b.better_address.toLowerCase() === betterAddress.toLowerCase()
        );
        if (bet) {
          bet.is_verified = true;
          console.log(`✅ Verified bet for match ${match.name}:
  Better: ${bet.better_tweet_name}
  Amount: ${bet.bet_amount} ETH
  Team: ${bet.team_name}
  TxHash: ${txHash}
`);
          fs.writeFileSync(this.storagePath, JSON.stringify(data, null, 2));
        } else {
          console.log(
            `❌ No matching bet found for address ${betterAddress} in match ${match.name}`
          );
        }
      } else {
        console.log(`❌ Match not found with betting address ${toAddress}`);
      }
    } catch (error) {
      console.error("Error updating bet verification:", error);
    }
  }

  public async startListening() {
    if (this.isListening) {
      console.log("Listener is already running");
      return;
    }

    this.isListening = true;
    console.log("Starting transaction listener for active matches...");

    const activeMatches = this.getActiveMatches();
    if (activeMatches.length === 0) {
      console.log("No active matches found");
      this.isListening = false;
      return;
    }

    const monitoredAddresses = activeMatches.map((match) =>
      match.betting_address.toLowerCase()
    );
    console.log(`Monitoring addresses: ${monitoredAddresses.join(", ")}`);

    try {
      this.unwatch = this.viemClient.watchBlocks({
        includeTransactions: true,
        onBlock: (block: any) => {
          console.log(`Processing block ${block.number}`);
          for (const tx of block.transactions) {
            if (
              tx.to &&
              monitoredAddresses.includes(tx.to.toLowerCase()) &&
              BigInt(tx.value) > BigInt(0)
            ) {
              const amount = Number(tx.value) / 1e18;
              const toAddress = tx.to.toLowerCase();
              const fromAddress = tx.from.toLowerCase();
              console.log(`📥 Incoming transaction:
  To: ${toAddress}
  From: ${fromAddress}
  Amount: ${amount} ETH
  Hash: ${tx.hash}
`);

              // Find the match and bet that matches this transaction
              for (const match of activeMatches) {
                if (match.betting_address.toLowerCase() === toAddress) {
                  const bet = match.bets.find(
                    (b) =>
                      b.better_address.toLowerCase() === fromAddress &&
                      Math.abs(b.bet_amount - amount) < 0.0001 // Allow small floating point differences
                  );

                  if (bet) {
                    console.log(`Found matching bet:
  Match: ${match.name}
  Better: ${bet.better_tweet_name}
  Expected Amount: ${bet.bet_amount} ETH
`);
                    this.updateBetVerification(match.id, fromAddress, tx.hash);
                  } else {
                    console.log(`No matching bet found for transaction:
  Match: ${match.name}
  From: ${fromAddress}
  Amount: ${amount} ETH
`);
                  }
                }
              }
            }
          }
        },
        onError: (error: any) => {
          console.error("Error watching blocks:", error);
          this.isListening = false;
        },
      });
      console.log("Successfully started watching blocks");
    } catch (error) {
      console.error("Failed to start watching blocks:", error);
      this.isListening = false;
    }
  }

  public stopListening() {
    if (this.unwatch) {
      this.unwatch();
      this.unwatch = null;
    }
    this.isListening = false;
    console.log("Stopped transaction listener");
  }
}
