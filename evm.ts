import { ethers } from "ethers";
import { contractCall } from "@neardefi/shade-agent-js";

const getProvider = () => {
  return new ethers.JsonRpcProvider("https://base-sepolia-rpc.publicnode.com");
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const evm = {
  name: "Base",
  chainId: 84532,
  currency: "ETH",
  explorer: "https://sepolia.basescan.org",

  // custom methods for basednames registration

  getGasPrice: async () => getProvider().getFeeData(),
  getBalance: ({ address }) => getProvider().getBalance(address),
  formatBalance: (balance) => ethers.formatEther(balance),

  send: async ({ path, from: address, to, amount, gasLimit = 21000n }) => {
    if (!address) return console.log("must provide a sending address");

    const { getGasPrice, chainId, getBalance, completeEthereumTx, currency } =
      evm;

    const balance = await getBalance({ address });
    console.log("balance", ethers.formatEther(balance), currency);

    const provider = getProvider();
    // get the nonce for the sender
    const nonce = await provider.getTransactionCount(address);
    const feeData = await getGasPrice();

    // check sending value
    const value = ethers.parseEther(amount);

    console.log("sending", amount, currency, "from", address, "to", to);

    const baseTx = {
      to,
      nonce,
      data: null,
      value,
      gasLimit,
      type: 2,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
      maxFeePerGas: feeData.maxFeePerGas,
      chainId,
    };

    return await completeEthereumTx({ baseTx, path });
  },

  // completes evm transaction calling NEAR smart contract get_signature method of shade agent
  // only a registered shade agent should be able to call this to generate signatures for the OTA deposit accounts we replied to users with
  completeEthereumTx: async ({ baseTx, path }) => {
    const { chainId } = evm;

    console.log("baseTx", baseTx);

    // create hash of unsigned TX to sign -> payload
    const tx = ethers.Transaction.from(baseTx);
    const hexPayload = ethers.keccak256(ethers.getBytes(tx.unsignedSerialized));
    const serializedTxHash = Buffer.from(hexPayload.substring(2), "hex");

    // get the signature from the NEAR contract
    const sigRes = await contractCall({
      accountId: undefined,
      methodName: "get_signature",
      args: {
        payload: [...serializedTxHash],
        path,
      },
    });

    // parse the signature r, s, v into an ethers signature instance
    const signature = ethers.Signature.from({
      r:
        "0x" +
        Buffer.from(sigRes.big_r.affine_point.substring(2), "hex").toString(
          "hex"
        ),
      s: "0x" + Buffer.from(sigRes.s.scalar, "hex").toString("hex"),
      v: sigRes.recovery_id + (chainId * 2 + 35),
    });
    console.log(
      "ethers.recoverAddress:",
      ethers.recoverAddress(serializedTxHash, signature)
    );
    // add signature to base transaction
    tx.signature = signature;
    const serializedTx = tx.serialized;

    return await evm.broadcastTransaction(serializedTx);
  },

  // broadcast transaction to evm chain, return object with explorerLink
  broadcastTransaction: async (serializedTx, second = false) => {
    console.log("BROADCAST serializedTx", serializedTx);

    try {
      const hash = await getProvider().send("eth_sendRawTransaction", [
        serializedTx,
      ]);
      console.log("SUCCESS! TX HASH:", hash);
      console.log(`Explorer Link: ${evm.explorer}/tx/${hash}`);

      return {
        success: true,
        hash,
        explorerLink: `${evm.explorer}/tx/${hash}`,
      };
    } catch (e) {
      if (/nonce too low/gi.test(JSON.stringify(e))) {
        return console.log("tx has been tried");
      }
      if (/gas too low|underpriced/gi.test(JSON.stringify(e))) {
        return console.log(e);
      }
      console.log(e);
      if (!second) {
        console.log("RETRY BROADCAST");
        await sleep(15000);
        return await evm.broadcastTransaction(serializedTx, true);
      }
      return {
        success: false,
        error: e,
      };
    }
  },
};

export default evm;
