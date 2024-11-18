
import mempoolJS from '@catalabs/mempool.js';
import { MempoolReturn } from '@catalabs/mempool.js/lib/interfaces';
import pRetry from 'p-retry';
const TESTNET = true;
// TODO: Fix



export class MempoolProvider {
  private TESTNET: boolean;

  bitcoin: MempoolReturn['bitcoin'];

  constructor() {
    const {
        bitcoin,
    } = mempoolJS({
      hostname: 'mempool.space',
      network: TESTNET ? 'testnet4' : undefined,
    });
    this.bitcoin = bitcoin;
  }


  async retry<T>(f: () => PromiseLike<T> | T): Promise<T> {
    return pRetry(
        f,
        {
          retries: 5,
          minTimeout: 1000,
          maxTimeout: 5000,
          factor: 2,
          onFailedAttempt: (error) => {
            console.error(
              `Attempt ${error.attemptNumber} failed. There are ${error.retriesLeft} retries left.`,
            );
          },
        },
      );
    }

  async isAddressDirty(address: string): Promise<boolean> {
    return this.retry(async () => {
      try {
        const addrState = await this.bitcoin.addresses.getAddress({ address });
        // Get the total number of transactions.
        const numTransaction = addrState.chain_stats.tx_count + addrState.mempool_stats.tx_count;
        if (numTransaction > 0) return true;
        return false;
      } catch (e) {
        throw new Error(`Failed to get address description ${e}`);
      }
    });
  }

  // TODO_NEED: Retry
  async getAddressUtxo(address: string) {
    return this.retry(async () => {
      try {
        return this.bitcoin.addresses.getAddressTxsUtxo({address});
      } catch (e) {
        throw new Error(`Failed to get address utxos ${e}`);
      }
    });
  }

  async broadcast(txhex: string) {
    return this.retry(async () => {
        const txId = await this.bitcoin.transactions.postTx(
            {txhex}
        )
        console.log(`Broadcasted transaction ${txId}`);
        return txId;
    });
  }
}