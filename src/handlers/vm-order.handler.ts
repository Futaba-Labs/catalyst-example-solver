import { StandardOrder, MandateOutput, CatalystOrder } from "src/types";
import { ethers, TransactionReceipt } from "ethers";
import { abi as CoinFillerAbi } from "../../abi/CoinFiller.json";
import { abi as WormholeOracleAbi } from "../../abi/WormholeOracle.json";
import { abi as CompactSettlerAbi } from "../../abi/CompactSettler.json";
import { getSigner, isSupportedChain } from "src/common/signer";
import {
  CATALYST_SETTLER_ADDRESS,
  WORMHOLE_ORACLE_ADDRESS,
  POLYMER_ORACLE_ADDRESS,
} from "src/common/constants";
import {
  abi,
  getAddressFromBytes32,
  getBytes32FromAddress,
  getEncodedFillDescription,
  getStandardOrderHash,
} from "./utils";
import axios from "axios";

export async function handleVmOrder(
  catalystOrder: CatalystOrder,
): Promise<void> {
  const { order, sponsorSignature, allocatorSignature } = catalystOrder;
  console.log("Processing CatalystOrder:", catalystOrder);

  // Validate supported chains for StandardOrder
  const originChainId = Number(order.originChainId);
  if (!isSupportedChain(originChainId)) {
    throw new Error(`Unsupported origin chain: ${originChainId}`);
  }

  // check if the order is expired
  if (order.fillDeadline < Date.now() / 1000) {
    throw new Error("Order is expired");
  }

  // Validate single output for now
  if (order.outputs.length !== 1) {
    throw new Error(
      `StandardOrder with ${order.outputs.length} outputs not supported yet`,
    );
  }

  const output = order.outputs[0];
  const destinationChainId = Number(output.chainId);

  if (!isSupportedChain(destinationChainId)) {
    throw new Error(`Unsupported destination chain: ${destinationChainId}`);
  }

  // Get signers for both chains
  const originChainNum = Number(order.originChainId);
  const originSigner = getSigner(originChainNum);
  const destinationSigner = getSigner(destinationChainId);

  // Get the filler contract
  const fillerAddress = getAddressFromBytes32(output.settler);
  const fillerContract = new ethers.Contract(
    fillerAddress,
    CoinFillerAbi,
    destinationSigner,
  );

  // Get solver identifier
  const solverIdentifier = getBytes32FromAddress(destinationSigner.address);

  console.log("order", order);
  // Get order identifier
  const orderIdentifier = getStandardOrderHash(
    CATALYST_SETTLER_ADDRESS[originChainNum],
    order,
  );

  console.log({
    fillerAddress,
    solverIdentifier,
    orderIdentifier,
    originChain: order.originChainId,
    destinationChain: destinationChainId,
  });

  // Approve token spending
  await approveTokenSpending(
    destinationSigner,
    getAddressFromBytes32(output.token),
    fillerAddress,
    output.amount,
  );

  // Fill the intent
  const fillTxReceipt = await fillIntent(
    fillerContract,
    orderIdentifier,
    order,
    solverIdentifier,
  );

  // Validate (submit to oracle)
  await validate({
    order,
    fillTransactionHash: fillTxReceipt.hash,
    destinationSigner,
    destinationChainId,
    fillerAddress,
    solverIdentifier,
    orderIdentifier,
    output,
  });

  // Claim (finalize on origin chain)
  await claim({
    order,
    fillTransactionHash: fillTxReceipt.hash,
    originSigner,
    solverIdentifier,
    sponsorSignature,
    allocatorSignature,
  });
}

// Helper functions
async function approveTokenSpending(
  signer: ethers.Wallet,
  tokenAddress: string,
  spender: string,
  amount: bigint,
): Promise<void> {
  console.log("Approving token spending...");

  const tokenContract = new ethers.Contract(
    tokenAddress,
    [
      {
        type: "function",
        name: "approve",
        inputs: [
          { name: "spender", type: "address" },
          { name: "amount", type: "uint256" },
        ],
        outputs: [{ name: "", type: "bool" }],
        stateMutability: "nonpayable",
      },
    ],
    signer,
  );

  const approveTx = await tokenContract.approve(spender, amount);
  const receipt = await approveTx.wait(1);
  console.log("Token approval confirmed:", JSON.stringify(receipt));
}

async function fillIntent(
  fillerContract: ethers.Contract,
  orderIdentifier: string,
  order: StandardOrder,
  solverIdentifier: string,
): Promise<TransactionReceipt> {
  console.log("Filling intent...");

  const fillTx = await fillerContract.fillOrderOutputs(
    order.fillDeadline,
    orderIdentifier,
    order.outputs,
    solverIdentifier,
  );

  const receipt = await fillTx.wait(1);
  console.log("Intent filled:", JSON.stringify(receipt));
  return receipt;
}

async function validate(args: {
  order: StandardOrder;
  fillTransactionHash: string;
  destinationSigner: ethers.Wallet;
  destinationChainId: number;
  fillerAddress: string;
  solverIdentifier: string;
  orderIdentifier: string;
  output: MandateOutput;
}): Promise<void> {
  console.log("Validating order via oracle...");

  const {
    order,
    fillTransactionHash,
    destinationSigner,
    destinationChainId,
    output,
  } = args;

  const originChainId = Number(order.originChainId);
  const originSigner = getSigner(originChainId);

  // Determine which oracle to use
  const localOracle = order.localOracle.toLowerCase();
  const isWormholeOracle =
    localOracle === WORMHOLE_ORACLE_ADDRESS[originChainId]?.toLowerCase();
  const isPolymerOracle =
    localOracle === POLYMER_ORACLE_ADDRESS[originChainId]?.toLowerCase();

  if (isPolymerOracle) {
    await validateWithPolymerOracle({
      order,
      fillTransactionHash,
      destinationSigner,
      originSigner,
      destinationChainId,
      originChainId,
    });
  } else if (isWormholeOracle) {
    await validateWithWormholeOracle({
      order,
      fillTransactionHash,
      destinationSigner,
      originSigner,
      destinationChainId,
      originChainId,
      output,
    });
  } else {
    console.warn(`Unknown oracle address: ${localOracle}`);
    // Fallback to Wormhole
    await validateWithWormholeOracle({
      order,
      fillTransactionHash,
      destinationSigner,
      originSigner,
      destinationChainId,
      originChainId,
      output,
    });
  }
}

async function validateWithPolymerOracle(args: {
  order: StandardOrder;
  fillTransactionHash: string;
  destinationSigner: ethers.Wallet;
  originSigner: ethers.Wallet;
  destinationChainId: number;
  originChainId: number;
}): Promise<void> {
  const {
    fillTransactionHash,
    destinationSigner,
    originSigner,
    destinationChainId,
    originChainId,
  } = args;

  // Get transaction receipt
  const transactionReceipt =
    await destinationSigner.provider!.getTransactionReceipt(
      fillTransactionHash,
    );
  if (!transactionReceipt) {
    throw new Error("Fill transaction receipt not found");
  }

  const numLogs = transactionReceipt.logs.length;
  if (numLogs < 2) {
    throw new Error(`Unexpected Logs count ${numLogs}`);
  }
  const fillLog = transactionReceipt.logs[1]; // The first log is transfer, next is fill.

  let proof: string | undefined;
  let polymerIndex: number | undefined;

  // Retry logic for getting proof from Polymer
  for (let i = 0; i < 10; ++i) {
    try {
      const response = await axios.post(`https://lintent.org/polymer`, {
        srcChainId: destinationChainId,
        srcBlockNumber: Number(transactionReceipt.blockNumber),
        globalLogIndex: Number(fillLog.index),
        polymerIndex,
      });

      const data = response.data as {
        proof: undefined | string;
        polymerIndex: number;
      };

      polymerIndex = data.polymerIndex;
      console.log(data);

      if (data.proof) {
        proof = data.proof;
        break;
      }
    } catch (error) {
      console.error(`Polymer proof request failed (attempt ${i + 1}):`, error);
    }

    // Wait with backoff before requesting again
    await new Promise((r) => setTimeout(r, i * 2000 + 1000));
  }

  console.log({ proof });
  if (!proof) {
    throw new Error("Failed to get proof from Polymer oracle");
  }

  // Submit proof to Polymer oracle on origin chain
  const polymerOracleContract = new ethers.Contract(
    POLYMER_ORACLE_ADDRESS[originChainId],
    [
      {
        type: "function",
        name: "receiveMessage",
        inputs: [{ name: "proof", type: "bytes" }],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ],
    originSigner,
  );

  const proofBytes = `0x${proof.replace("0x", "")}`;
  const submitTx = await polymerOracleContract.receiveMessage(proofBytes);
  await submitTx.wait(1);

  console.log("Submitted proof to Polymer oracle:", submitTx.hash);
}

async function validateWithWormholeOracle(args: {
  order: StandardOrder;
  fillTransactionHash: string;
  destinationSigner: ethers.Wallet;
  originSigner: ethers.Wallet;
  destinationChainId: number;
  originChainId: number;
  output: MandateOutput;
}): Promise<void> {
  const {
    order,
    destinationSigner,
    destinationChainId,
    originChainId,
    output,
  } = args;

  // Submit to Wormhole oracle on destination chain
  const wormholeContract = new ethers.Contract(
    WORMHOLE_ORACLE_ADDRESS[destinationChainId],
    WormholeOracleAbi,
    destinationSigner,
  );

  const block = await destinationSigner.provider!.getBlock("latest");
  const timestamp = block!.timestamp;
  const orderIdentifier = getStandardOrderHash(
    CATALYST_SETTLER_ADDRESS[originChainId],
    order,
  );
  const solverIdentifier = getBytes32FromAddress(destinationSigner.address);

  const fillDescriptionBytes = getEncodedFillDescription(
    solverIdentifier,
    orderIdentifier,
    timestamp,
    output,
  );

  const fillerAddress = getAddressFromBytes32(output.settler);
  const submitTx = await wormholeContract.submit(fillerAddress, [
    fillDescriptionBytes,
  ]);

  await submitTx.wait(1);
  console.log("Submitted to Wormhole oracle:", submitTx.hash);

  // TODO: Implement VAA retrieval and submission to origin chain
  // For now, just log that this step is needed
  console.log("TODO: Retrieve VAA and submit to origin chain Wormhole oracle");
}

async function claim(args: {
  order: StandardOrder;
  fillTransactionHash: string;
  originSigner: ethers.Wallet;
  solverIdentifier: string;
  sponsorSignature?: string;
  allocatorSignature?: string;
}): Promise<void> {
  console.log("Claiming order...");

  const {
    order,
    fillTransactionHash,
    originSigner,
    sponsorSignature = "0x",
    allocatorSignature = "0x",
  } = args;

  const originChainId = Number(order.originChainId);
  const destinationChainId = Number(order.outputs[0].chainId);
  const destinationSigner = getSigner(destinationChainId);

  // Validate single output
  if (order.outputs.length !== 1) {
    throw new Error("Order must have exactly one output");
  }

  // Get fill transaction receipt to extract timestamp
  const transactionReceipt =
    await destinationSigner.provider!.getTransactionReceipt(
      fillTransactionHash,
    );
  if (!transactionReceipt) {
    throw new Error("Fill transaction receipt not found");
  }

  const block = await destinationSigner.provider!.getBlock(
    transactionReceipt.blockHash,
  );
  if (!block) {
    throw new Error("Fill transaction block not found");
  }

  const fillTimestamp = Number(block.timestamp);

  // Prepare compact settler contract
  const compactSettler = new ethers.Contract(
    CATALYST_SETTLER_ADDRESS[originChainId],
    CompactSettlerAbi,
    originSigner,
  );

  // Create combined signatures using abi.encode
  const combinedSignatures = abi.encode(
    ["bytes", "bytes"],
    [sponsorSignature, allocatorSignature],
  );

  // Convert solver identifier to bytes32 format for solver array
  const solverBytes32 = getBytes32FromAddress(originSigner.address);

  const finalizeTx = await compactSettler.finalise(
    order,
    combinedSignatures,
    [fillTimestamp], // timestamps array
    [solverBytes32], // solvers array
    solverBytes32, // destination
    "0x", // call data
  );

  await finalizeTx.wait(1);
  console.log("Order finalized:", finalizeTx.hash);
}
