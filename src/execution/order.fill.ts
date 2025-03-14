import { BridgeOracle__factory } from "lib/contracts";
import { OrderKey } from "src/types/order-key.types";
import { BitcoinWallet } from "./bitcoin/bitcoin.wallet";
import { BITCOIN_IDENTIFIER } from "src/common/constants";
import { relayerSigner } from "src/common/signer";
import { decodeBitcoinAddress } from "./bitcoin/bitcoin.utils";

async function fillEVM(order: OrderKey) {
  let recordedChain: bigint;
  let remoteOracle: string;
  const outputs = order.outputs;
  for (const output of order.outputs) {
    if (recordedChain === undefined) recordedChain = output.chainId;
    if (remoteOracle === undefined) remoteOracle = output.remoteOracle;
    if (recordedChain !== output.chainId) {
      throw Error(
        `Mixed ChainIds, seen ${recordedChain} and ${output.chainId}`,
      );
    }
    if (remoteOracle !== output.remoteOracle) {
      throw Error(
        `Mixed Oracles, seen ${remoteOracle} and ${output.remoteOracle}`,
      );
    }
  }
  const oracle = BridgeOracle__factory.connect(
    remoteOracle,
    (await relayerSigner) as any,
  );

  // TODO: Set approvals for the oracleAddress for the value of the output.

  // We need to provide fill times. These have to be set to proofTime.
  // These are used to ensure you can't reuse fills.
  const fillTimes = order.outputs.map(() => order.reactorContext.proofDeadline);

  // Call the reactor to initiate the order.
  return oracle.fill(outputs, fillTimes);
}

const TESTNET = true;
// Initialize a Bitcoin wallet.
export const bitcoinWallet = new BitcoinWallet(!TESTNET);

async function fillBTC(order: OrderKey) {
  console.log({ order });
  // We only support single BTC fills:
  if (order.outputs.length != 1)
    throw Error(
      `Multiple outputs found in Bitcoin fill. Found: ${order.outputs.length}`,
    );

  const output = order.outputs[0];
  if (output.amount <= bitcoinWallet.BITCOIN_DUST_LIMIT)
    console.log(
      `Unlikely to broadcast transaction because of dust limit: ${bitcoinWallet.BITCOIN_DUST_LIMIT} sats`,
    );

  const recipientHash = output.recipient;
  const version = Number("0x" + output.token.slice(output.token.length - 2));

  const bitcoinRecipientAddress = decodeBitcoinAddress(
    version,
    recipientHash,
    TESTNET,
  );

  const satoshis = output.amount;
  console.log({
    bitcoinRecipientAddress,
    satoshis,
  });

  const txhex = bitcoinWallet
    .makeTransaction(
      bitcoinRecipientAddress,
      BigInt(satoshis),
      output.remoteCall,
    )
    .toHex();

  // Broadcast!
  const bitcoinTransactionId = (await bitcoinWallet.mempoolProvider.broadcast(
    txhex,
  )) as string;
  bitcoinWallet.ownTransactions.set(bitcoinTransactionId.toLowerCase(), true);
}

export async function fillOutputs(order: OrderKey) {
  // Define the reactor we will call. You can get the reactor address from the order
  // Check if order outputs are Bitcoin // TODO:
  if (
    order.outputs[0].token.replace("0x", "").slice(0, 64 - 4) ==
    BITCOIN_IDENTIFIER
  ) {
    fillBTC(order);
  } else {
    fillEVM(order);
  }
}
