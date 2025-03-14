import { Defender } from "@openzeppelin/defender-sdk";
import {
  OZ_RELAYER_API_KEY,
  OZ_RELAYER_API_SECRET,
  RPC_URL,
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

export const provider = new ethers.JsonRpcProvider(RPC_URL);
export const signer = new ethers.Wallet(SOLVER_PK).connect(provider);
