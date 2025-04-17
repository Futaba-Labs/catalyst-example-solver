import { Controller, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";

export interface InventoryItem {
  chainId: number; // Chain ID (e.g., 11155111 for Ethereum)
  asset: string; // Token address
  fromPrice: string; // Price of token in USDC when sold to the solver
  toPrice: string; // Price of token in USDC when bought from the solver
  fromCost: string; // Cost of token in USDC when sold to the solver
  toCost: string; // Cost of token in USDC when bought from the solver
  maxAmount: number; // Maximum amount the solver will handle
  minAmount?: number; // Optional minimum amount
  expiry?: number; // Expiry timestamp in seconds
}

const inventory: InventoryItem[] = [
  {
    chainId: 11155111, // Ethereum
    asset: "0xf08A50178dfcDe18524640EA6618a1f965821715", // USDC on Ethereum
    fromPrice: "1000000", // price of token in USDC when sold to the solver
    toPrice: "1100000", // price of token in USDC when bought from the solver
    fromCost: "1000", // cost of token in USDC when sold to the solver
    toCost: "1000", // cost of token in USDC when bought from the solver
    maxAmount: 1000000000, // max the solver will handle
    minAmount: 1000000, // optional minimum amount
    expiry: Date.now() + 5000, // 5 seconds from now
  },
  {
    chainId: 84532,
    asset: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    fromPrice: "9900000", // price of token in USDC when sold to the solver
    toPrice: "1000000", // price of token in USDC when bought from the solver
    fromCost: "2000", // cost of token in USDC when sold to the solver
    toCost: "3000", // cost of token in USDC when bought from the solver
    maxAmount: 1000000000, // max the solver will handle
    minAmount: 1000000, // optional minimum amount
    expiry: Date.now() + 5000, // 5 seconds from now
  },
];

const INVENTORY_UPDATE_INTERVAL = 5000;
const INVENTORY_EXPIRY_MS = 8000;

@Controller()
export class IntentoryDispatcher implements OnModuleInit {
  apiKey: string;
  baseUri: string;

  constructor(private config: ConfigService) {
    this.apiKey = this.config.getOrThrow("ORDER_SERVER_API_KEY");
    this.baseUri = this.config.getOrThrow("ORDER_SERVER_API_URI");
  }

  onModuleInit() {
    console.log("starting inventory dispatcher...");
    setInterval(async () => {
      console.log("dispatching inventory...");
      await Promise.allSettled(
        inventory.map((inventory) => this.pushInventory(inventory)),
      );
    }, INVENTORY_UPDATE_INTERVAL);
  }

  async pushInventory(inventory: InventoryItem) {
    // update expiry
    inventory.expiry = Date.now() + INVENTORY_EXPIRY_MS;

    const res = await axios.post(
      `${this.baseUri}/quotes/submit`,
      {
        ...inventory,
      },
      {
        headers: {
          "x-api-key": this.apiKey,
        },
      },
    );
    console.log("res", res.data);
  }
}
