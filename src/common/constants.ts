import "dotenv/config";

export const DUTCH_AUCTION_REACTOR =
  "0x00000000cc92DA57667f6Aad16AbBe9A93a798f0";

export const LIMIT_ORDER_REACTOR = "0x0000000035eb820252C699925Af8ABfad1a97318";

export const BITCOIN_ORACLE = "0x000000Ee3Edef26AB5B58922406A2C409661fe23";

export const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

export const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

export const BTC_TOKEN_ADDRESS_PREFIX =
  "0x000000000000000000000000BC0000000000000000000000000000000000";

export const BITCOIN_IDENTIFIER =
  "000000000000000000000000BC0000000000000000000000000000000000".toLowerCase();

export const DEFAULT_UW_INCENTIVE = 0.01; // 1%

export const SOLVER_ADDRESS = process.env.SOLVER_ADDRESS;
if (!SOLVER_ADDRESS) {
  throw new Error("SOLVER_ADDRESS is not defined");
}

export const BASE_RPC_URL = process.env.BASE_RPC_URL;
if (!BASE_RPC_URL) {
  throw new Error("BASE_RPC_URL is not defined");
}
export const ETH_RPC_URL = process.env.ETH_RPC_URL;
if (!ETH_RPC_URL) {
  throw new Error("ETH_RPC_URL is not defined");
}
export const SOLVER_PK = process.env.SOLVER_PK;
if (!SOLVER_PK) {
  throw new Error("SOLVER_PK is not defined");
}

export const OZ_RELAYER_API_KEY = process.env.OZ_RELAYER_API_KEY;
export const OZ_RELAYER_API_SECRET = process.env.OZ_RELAYER_API_SECRET;

if (!OZ_RELAYER_API_KEY || !OZ_RELAYER_API_SECRET) {
  throw new Error("Missing OZ_RELAYER_API_KEY or OZ_RELAYER_API_SECRET");
}

// V3
export const compactSettlerAddress: Record<number, string> = {
  84532: "0x115513dd91e9d8a18a9b1469307d219830dc37fd",
  11155111: "0x115513dd91e9d8a18a9b1469307d219830dc37fd",
};
export const solverAddress: Record<number, string> = {
  84532: "0x9773DAcbc46CAFb4e055060565e319922B48607D",
  11155111: "0x9773DAcbc46CAFb4e055060565e319922B48607D",
};

export const whOracleAddress: Record<number, string> = {
  84532: "0x7Bc921c858C5390d9FD74c337dd009eC9A1B6B8f",
  11155111: "0x7Bc921c858C5390d9FD74c337dd009eC9A1B6B8f",
};

export const usdcAddress: Record<number, string> = {
  84532: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  11155111: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
};
