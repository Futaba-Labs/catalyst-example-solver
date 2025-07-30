// import { Defender } from "@openzeppelin/defender-sdk";
import {
  // OZ_RELAYER_API_KEY,
  // OZ_RELAYER_API_SECRET,
  BASE_RPC_URL,
  ETH_RPC_URL,
  SOLVER_PK,
  CHAIN_IDS,
  RPC_URLS,
} from "./constants";
import { ethers } from "ethers";

// export const relayer = new Defender({
//   relayerApiKey: OZ_RELAYER_API_KEY,
//   relayerApiSecret: OZ_RELAYER_API_SECRET,
// });

// // the network is deduceted from the API key
// export const relayerProvider = relayer.relaySigner.getProvider();
// export const relayerSigner = relayer.relaySigner.getSigner(relayerProvider, {
//   speed: "fast",
// });

interface ProviderMapping {
  [chainId: number]: ethers.Provider;
}

interface SignerMapping {
  [chainId: number]: ethers.Wallet;
}

// Updated provider mapping for all supported chains
export const provider: ProviderMapping = {
  [CHAIN_IDS.SEPOLIA]: new ethers.JsonRpcProvider(
    ETH_RPC_URL || RPC_URLS[CHAIN_IDS.SEPOLIA],
  ),
  [CHAIN_IDS.BASE_SEPOLIA]: new ethers.JsonRpcProvider(
    BASE_RPC_URL || RPC_URLS[CHAIN_IDS.BASE_SEPOLIA],
  ),
  [CHAIN_IDS.OPTIMISM_SEPOLIA]: new ethers.JsonRpcProvider(
    RPC_URLS[CHAIN_IDS.OPTIMISM_SEPOLIA],
  ),
  [CHAIN_IDS.ARBITRUM_SEPOLIA]: new ethers.JsonRpcProvider(
    RPC_URLS[CHAIN_IDS.ARBITRUM_SEPOLIA],
  ),
};

// Create signers for all supported chains
export const signers: SignerMapping = {
  [CHAIN_IDS.SEPOLIA]: new ethers.Wallet(SOLVER_PK).connect(
    provider[CHAIN_IDS.SEPOLIA],
  ),
  [CHAIN_IDS.BASE_SEPOLIA]: new ethers.Wallet(SOLVER_PK).connect(
    provider[CHAIN_IDS.BASE_SEPOLIA],
  ),
  [CHAIN_IDS.OPTIMISM_SEPOLIA]: new ethers.Wallet(SOLVER_PK).connect(
    provider[CHAIN_IDS.OPTIMISM_SEPOLIA],
  ),
  [CHAIN_IDS.ARBITRUM_SEPOLIA]: new ethers.Wallet(SOLVER_PK).connect(
    provider[CHAIN_IDS.ARBITRUM_SEPOLIA],
  ),
};

// Backward compatibility exports
export const baseSigner = signers[CHAIN_IDS.BASE_SEPOLIA];
export const ethSigner = signers[CHAIN_IDS.SEPOLIA];

// Helper functions
export const getProvider = (chainId: number): ethers.Provider => {
  const prov = provider[chainId];
  if (!prov) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }
  return prov;
};

export const getSigner = (chainId: number): ethers.Wallet => {
  const signer = signers[chainId];
  if (!signer) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }
  return signer;
};

// Check if a chain is supported
export const isSupportedChain = (chainId: number): boolean => {
  return chainId in provider;
};
