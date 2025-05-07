import { ethers } from "ethers";
import { networkId, contractCall } from "@neardefi/shade-agent-js";

// Base Sepolia contract addresses from README
const REGISTRAR_CONTROLLER_ADDRESS = {
  testnet: "0x49ae3cc2e3aa768b1e5654f5d3c6002144a59581",
  mainnet: "0x4cCb0BB02FCABA27e82a56646E81d8c5bC4119a5",
}; // RegistrarController on Base Sepolia
const L2_RESOLVER_ADDRESS = {
  testnet: "0x6533C94869D28fAA8dF77cc63f9e2b2D6Cf77eBA",
  mainnet: "0xC6d566A56A1aFf6508b41f6c90ff131615583BCD",
}; // L2Resolver on Base Sepolia

// ABIs for Base Name Service contracts
const REGISTRAR_CONTROLLER_ABI = [
  "function valid(string memory name) public pure returns (bool)",
  "function available(string memory name) public view returns (bool)",
  "function register(RegisterRequest calldata request) public payable validRegistration(request)",
  "function rentPrice(string calldata name, uint256 duration) public view returns (IPriceOracle.Price memory price)",
  "function registerPrice(string memory name, uint256 duration) public view returns (uint256)",
];

// Define the RegisterRequest struct
const REGISTER_REQUEST_TYPE = `
tuple(
    string name,
    address owner,
    uint256 duration,
    address resolver,
    bytes[] data,
    bool reverseRecord
)
`;

const L2_RESOLVER_ABI = [
  "function setAddr(bytes32 node, address addr) external",
  "function setText(bytes32 node, string calldata key, string calldata value) external",
  "function setName(bytes32 node, string calldata name) external",
];

const getProvider = () => {
  return new ethers.JsonRpcProvider("https://base-sepolia-rpc.publicnode.com");
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const evm = {
  name: "Base",
  chainId: networkId === "testnet" ? 84532 : 8453,
  currency: "ETH",
  explorer:
    networkId === "testnet"
      ? "https://sepolia.basescan.org"
      : "https://basescan.org",

  // custom methods for basednames registration

  getGasPrice: async () => getProvider().getFeeData(),
  getBalance: ({ address }) => getProvider().getBalance(address),
  formatBalance: (balance) => ethers.formatEther(balance),

  send: async ({
    path,
    from: address,
    to = "0x525521d79134822a342d330bd91DA67976569aF1",
    amount = "0.000001",
    gasLimit = 21000,
  }) => {
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

    console.log("networkId", networkId);
    console.log("baseTx", baseTx);

    // create hash of unsigned TX to sign -> payload
    const tx = ethers.Transaction.from(baseTx);
    const hexPayload = ethers.keccak256(ethers.getBytes(tx.unsignedSerialized));
    const serializedTxHash = Buffer.from(hexPayload.substring(2), "hex");

    // get the signature from the NEAR contract
    const sigRes = await contractCall({
      accountId: process.env.NEXT_PUBLIC_accountId,
      contractId: process.env.NEXT_PUBLIC_contractId,
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
        return { success: false, error: "Transaction already tried" };
      }
      if (/gas too low|underpriced/gi.test(JSON.stringify(e))) {
        return { success: false, error: e };
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
