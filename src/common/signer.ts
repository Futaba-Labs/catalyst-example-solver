import { Defender } from "@openzeppelin/defender-sdk";
import {
  OZ_RELAYER_API_KEY,
  OZ_RELAYER_API_SECRET,
  BASE_RPC_URL,
  ETH_RPC_URL,
  SOLVER_PK,
} from "./constants";
import { ethers } from "ethers";

export const relayer = new Defender({
  relayerApiKey: OZ_RELAYER_API_KEY,
  relayerApiSecret: OZ_RELAYER_API_SECRET,
});

// the network is deduceted from the API key
export const relayerProvider = relayer.relaySigner.getProvider();
export const relayerSigner = relayer.relaySigner.getSigner(relayerProvider, {
  speed: "fast",
});

interface ProviderMapping {
  [chainId: number]: ethers.Provider;
}
export const provider: ProviderMapping = {
  84532: new ethers.JsonRpcProvider(BASE_RPC_URL),
  11155111: new ethers.JsonRpcProvider(ETH_RPC_URL),
};

export const baseSigner = new ethers.Wallet(SOLVER_PK).connect(provider[84532]);
export const ethSigner = new ethers.Wallet(SOLVER_PK).connect(
  provider[11155111],
);
