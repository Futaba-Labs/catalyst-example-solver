import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ethers } from "ethers";
import { provider } from "../common/signer";
import { compactSettlerAddress } from "../common/constants";
import { abi as CompactSettlerAbi } from "../../abi/CompactSettler.json";

@Injectable()
export class OnchainOrderService {
  private readonly logger = new Logger(OnchainOrderService.name);
  private isPolling = false;
  private pollingInterval = 5000; // 5 seconds
  private lastProcessedBlock: Record<number, number> = {};

  constructor(private config: ConfigService) {}

  // onModuleInit()を無効化 - 手動でstartPolling()を呼び出す必要があります
  // async onModuleInit() {
  //   await this.startPolling();
  // }

  async startPolling() {
    if (this.isPolling) return;

    this.isPolling = true;
    this.logger.log("Starting on-chain order polling...");

    // Initialize last processed blocks
    for (const chainId of Object.keys(compactSettlerAddress).map(Number)) {
      try {
        const currentBlock = await provider[chainId].getBlockNumber();
        this.lastProcessedBlock[chainId] = currentBlock;
        this.logger.log(
          `Starting from block ${currentBlock} on chain ${chainId}`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to get current block for chain ${chainId}:`,
          error,
        );
      }
    }

    this.pollForOrders();
  }

  private async pollForOrders() {
    while (this.isPolling) {
      try {
        await Promise.all(
          Object.keys(compactSettlerAddress).map((chainId) =>
            this.pollChain(Number(chainId)),
          ),
        );
      } catch (error) {
        this.logger.error("Error during polling:", error);
      }

      await new Promise((resolve) => setTimeout(resolve, this.pollingInterval));
    }
  }

  private async pollChain(chainId: number) {
    try {
      const contractAddress = compactSettlerAddress[chainId];
      if (!contractAddress) return;

      const currentBlock = await provider[chainId].getBlockNumber();
      const fromBlock = this.lastProcessedBlock[chainId] || currentBlock - 10;

      if (fromBlock >= currentBlock) return;

      this.logger.debug(
        `Polling chain ${chainId} from block ${fromBlock} to ${currentBlock}`,
      );

      // Create contract instance
      const contract = new ethers.Contract(
        contractAddress,
        CompactSettlerAbi,
        provider[chainId],
      );

      // Listen for Finalised events which might indicate order processing
      const finalisedFilter = contract.filters.Finalised();
      const finalisedEvents = await contract.queryFilter(
        finalisedFilter,
        fromBlock,
        currentBlock,
      );

      // Listen for OrderPurchased events
      const purchasedFilter = contract.filters.OrderPurchased();
      const purchasedEvents = await contract.queryFilter(
        purchasedFilter,
        fromBlock,
        currentBlock,
      );

      const depositedFilter = contract.filters.Deposited();
      const depositedEvents = await contract.queryFilter(
        depositedFilter,
        fromBlock,
        currentBlock,
      );

      // Process events
      for (const event of [
        ...finalisedEvents,
        ...purchasedEvents,
        ...depositedEvents,
      ]) {
        if (event instanceof ethers.EventLog) {
          await this.processOrderEvent(event, chainId);
        }
      }

      this.lastProcessedBlock[chainId] = currentBlock;
    } catch (error) {
      this.logger.error(`Error polling chain ${chainId}:`, error);
    }
  }

  private async processOrderEvent(event: ethers.EventLog, chainId: number) {
    try {
      this.logger.log(
        `Processing ${event.eventName} event on chain ${chainId}:`,
        event.args,
      );

      // Get the transaction that emitted this event
      const tx = await provider[chainId].getTransaction(event.transactionHash);
      if (!tx) {
        this.logger.warn(`Could not find transaction ${event.transactionHash}`);
        return;
      }

      // Process the transaction data
      await this.processTransactionFromEvent(tx, chainId);
    } catch (error) {
      this.logger.error("Error processing order event:", error);
    }
  }

  private async processTransactionFromEvent(
    tx: ethers.TransactionResponse,
    chainId: number,
  ) {
    try {
      // Decode transaction data to identify order submissions
      const contractAddress = compactSettlerAddress[chainId];
      const contract = new ethers.Contract(
        contractAddress,
        CompactSettlerAbi,
        provider[chainId],
      );

      this.logger.log(`Contract address: ${contractAddress}`);

      // Try to decode the transaction data
      const decodedData = contract.interface.parseTransaction({
        data: tx.data,
        value: tx.value,
      });

      if (decodedData) {
        this.logger.log(`Decoded transaction on chain ${chainId}:`, {
          functionName: decodedData.name,
          args: decodedData.args,
          txHash: tx.hash,
        });

        // Handle specific function calls that might contain orders
        if (
          decodedData.name === "finaliseSelf" ||
          decodedData.name === "finaliseFor" ||
          decodedData.name === "finaliseTo"
        ) {
          // Extract order data from function arguments
          const orderArg = decodedData.args[0]; // First argument is usually the order
          if (orderArg) {
            await this.handleOnchainOrder(orderArg, chainId, tx.hash);
          }
        } else if (decodedData.name === "purchaseOrder") {
          // Handle purchaseOrder function calls (equivalent to deposited events)
          const orderArg = decodedData.args[1]; // Second argument is the order
          if (orderArg) {
            await this.handlePurchaseOrder(
              orderArg,
              chainId,
              tx.hash,
              decodedData.args,
            );
          }
        } else if (decodedData.name === "depositFor") {
          // Handle depositFor function calls that emit Deposited events
          const orderArg = decodedData.args[0]; // First argument is the order
          if (orderArg) {
            await this.handleDepositedOrder(orderArg, chainId, tx.hash);
          }
        }
      }
    } catch (error) {
      // Transaction data might not be decodable if it's not for our contract functions
      this.logger.debug(
        `Could not decode transaction ${tx.hash}:`,
        error.message,
      );
    }
  }

  private async handleOnchainOrder(
    orderData: any,
    chainId: number,
    txHash: string,
  ) {
    try {
      this.logger.log(`Handling on-chain order from tx ${txHash}`);
      // Note: handleVmOrder now only processes StandardOrder, but this is CompactOrder
      // TODO: Implement separate handling for CompactOrder if needed
      this.logger.warn(
        "On-chain CompactOrder processing not implemented for new StandardOrder-only handler",
      );
    } catch (error) {
      this.logger.error(
        `Error handling on-chain order from tx ${txHash}:`,
        error,
      );
    }
  }

  private async handlePurchaseOrder(
    orderData: any,
    chainId: number,
    txHash: string,
    allArgs: any[],
  ) {
    try {
      // purchaseOrder function arguments:
      // [orderId, order, orderSolvedByIdentifier, purchaser, expiryTimestamp, newDestination, call, discount, timeToBuy, solverSignature]
      const purchaser = allArgs[3];

      this.logger.log(
        `Handling purchase order from tx ${txHash}, purchaser: ${purchaser}`,
      );
      // Note: handleVmOrder now only processes StandardOrder, but this is CompactOrder
      // TODO: Implement separate handling for CompactOrder if needed
      this.logger.warn(
        "Purchase CompactOrder processing not implemented for new StandardOrder-only handler",
      );
    } catch (error) {
      this.logger.error(
        `Error handling purchase order from tx ${txHash}:`,
        error,
      );
    }
  }

  private async handleDepositedOrder(
    orderData: any,
    chainId: number,
    txHash: string,
  ) {
    try {
      this.logger.log(`Handling deposited order from tx ${txHash}`);
      // Note: handleVmOrder now only processes StandardOrder, but this is CompactOrder
      // TODO: Implement separate handling for CompactOrder if needed
      this.logger.warn(
        "Deposited CompactOrder processing not implemented for new StandardOrder-only handler",
      );
    } catch (error) {
      this.logger.error(
        `Error handling deposited order from tx ${txHash}:`,
        error,
      );
    }
  }

  stopPolling() {
    this.isPolling = false;
    this.logger.log("Stopped on-chain order polling");
  }
}
