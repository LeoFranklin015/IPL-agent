import fs from "fs";
import * as dotenv from "dotenv";
dotenv.config({ path: "./.env.development.local" });
import { parseSeedPhrase } from "near-seed-phrase";
import * as nearAPI from "near-api-js";
const { Near, Account, KeyPair, keyStores } = nearAPI;

const networkId = "testnet";
const accountId = process.env.NEAR_ACCOUNT_ID;
const contractId = process.env.NEAR_ACCOUNT_ID;

// Create a key store and add the key pair
const keyStore = new keyStores.InMemoryKeyStore();
const privateKey = process.env.NEAR_PRIVATE_KEY;
const keyPair = KeyPair.fromString(privateKey);

// Add the key pair to the key store for both accounts
keyStore.setKey(networkId, accountId, keyPair);
keyStore.setKey(networkId, contractId, keyPair);

const config = {
  networkId,
  keyStore,
  nodeUrl: "https://rpc.testnet.near.org",
  walletUrl: "https://mynearwallet.com/",
  explorerUrl: "https://nearblocks.io",
};

const near = new Near(config);
const { connection } = near;
const gas = BigInt("300000000000000");

export const getAccount = (id) => new Account(connection, id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const deploy = async () => {
  try {
    // First check if the account exists
    const account = getAccount(accountId);
    try {
      await account.state();
      console.log("Account exists, proceeding with deployment");
    } catch (e) {
      console.log(
        "Account does not exist. Please create it first using the NEAR wallet."
      );
      console.log("Visit: https://wallet.testnet.near.org/");
      console.log("Create an account named:", accountId);
      console.log("Then fund it with some NEAR tokens");
      return;
    }

    await sleep(1000);

    // Deploy the contract
    const file = fs.readFileSync("./contract/target/near/contract.wasm");
    const contractAccount = getAccount(contractId);
    await contractAccount.deployContract(file);
    console.log("Contract deployed successfully");
    console.log("Deployed bytes:", file.byteLength);

    const balance = await contractAccount.getAccountBalance();
    console.log("Contract balance:", balance);

    await sleep(1000);

    // Initialize the contract
    const initRes = await contractAccount.functionCall({
      contractId,
      methodName: "init",
      args: {
        owner_id: accountId,
      },
      gas,
    });

    console.log("Contract initialized:", initRes);
  } catch (e) {
    console.error("Deployment failed:", e);
    throw e;
  }
};

deploy();
