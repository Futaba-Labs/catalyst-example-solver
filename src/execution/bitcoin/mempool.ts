import mempoolJS from "@catalabs/mempool.js";
import { MempoolReturn } from "@catalabs/mempool.js/lib/interfaces";
import pRetry from "p-retry";
import { now } from "./bitcoin.wallet";
const TESTNET = true;
// TODO: Fix

// Needs to be larger than any timestamp we will see in our lifetime.
const ONE_DAY = 60 * 60 * 24; // 1 day

export class MempoolProvider {
  private TESTNET: boolean;

  bitcoin: MempoolReturn["bitcoin"];

  constructor() {
    const { bitcoin } = mempoolJS({
      hostname: "mempool.space",
      network: TESTNET ? "testnet4" : undefined,
    });
    this.bitcoin = bitcoin;
  }

  async retry<T>(f: () => PromiseLike<T> | T): Promise<T> {
    return pRetry(f, {
      retries: 5,
      minTimeout: 1000,
      maxTimeout: 5000,
      factor: 2,
      onFailedAttempt: (error) => {
        console.error(
          `Attempt ${error.attemptNumber} failed. There are ${error.retriesLeft} retries left.`,
        );
      },
    });
  }

  async addressLastUsedAt(address: string): Promise<number> {
    return this.retry(async () => {
      try {
        // mempool promises this is sorted by latest.
        const addressTransactions = await this.bitcoin.addresses.getAddressTxs({
          address,
        });
        // get the max timestamp of the latest transactions. If an unconfirmed transaction exists, set to 1 day in the future.
        const transactionTimes = addressTransactions
          .filter(
            (tx) =>
              Math.max(
                ...tx.vout.map((vo) =>
                  Number(vo.scriptpubkey_address == address),
                ),
              ) == 1,
          ) // Select incoming transactions
          .map((tx) =>
            tx.status.confirmed ? tx.status.block_time : ONE_DAY + now(),
          );
        return Math.max(...transactionTimes, 0);
      } catch (e) {
        throw new Error(`Failed to get address description ${e}`);
      }
    });
  }

  // TODO_NEED: Retry
  async getAddressUtxo(address: string) {
    return this.retry(async () => {
      try {
        return this.bitcoin.addresses.getAddressTxsUtxo({ address });
      } catch (e) {
        throw new Error(`Failed to get address utxos ${e}`);
      }
    });
  }

  async broadcast(txhex: string) {
    return this.retry(async () => {
      const txId = await this.bitcoin.transactions.postTx({ txhex });
      console.log(`Broadcasted transaction ${txId}`);
      return txId;
    });
  }
}
