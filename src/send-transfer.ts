import { ethers } from "ethers";

// Replace with your private key
const privateKey =
  "0xcd9d63ad738a42a1f8172e48d1d61d03831e963a341b5f88d2870ebeb2aea368";

// Connect to the Ethereum network (you can use a provider like Infura or Alchemy)
const provider = new ethers.JsonRpcProvider(
  "https://base-sepolia-rpc.publicnode.com",
);

// Create a wallet instance from the private key
const wallet = new ethers.Wallet(privateKey, provider);

// Define the transaction details
const tx = {
  to: "0x76a6af480cD444FeB56B201E33720DDF4Eae1EaE",
  value: ethers.parseEther("0.0001"), // Amount to send in ether
  gasLimit: 41000, // Basic transaction gas limit
  maxFeePerGas: ethers.parseUnits("50", "gwei"), // Set a higher max fee per gas
  maxPriorityFeePerGas: ethers.parseUnits("2", "gwei"), // Set a higher priority fee
  // You can also specify gasPrice, nonce, etc.
};

// Send the transaction
async function sendTransaction() {
  try {
    const address = await wallet.getAddress();
    const nonce = await wallet.getNonce();
    console.log({
      wallet,
      nonce,
    });
    return;

    const transactionResponse = await wallet.sendTransaction(tx);
    console.log("Transaction sent:", transactionResponse.hash);

    // // Wait for the transaction to be mined
    const receipt = await transactionResponse.wait();
    console.log("Transaction mined:", receipt);
  } catch (error) {
    console.error("Error sending transaction:", error);
  }
}

sendTransaction();
