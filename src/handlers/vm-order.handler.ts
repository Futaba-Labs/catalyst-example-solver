import { CatalystEvent, CatalystOrder } from "src/types";
import { ethers, TransactionReceipt } from "ethers";
import { abi as CoinFillerAbi } from "../../abi/CoinFiller.json";
import { abi as WormholeOracleAbi } from "../../abi/WormholeOracle.json";
import { abi as CompactSettlerAbi } from "../../abi/CompactSettler.json";
import { baseSigner, ethSigner } from "src/common/signer";
import {
  compactSettlerAddress,
  usdcAddress,
  whOracleAddress,
} from "src/common/constants";
import {
  abi,
  getAddressFromBytes32,
  getBytes32FromAddress,
  getEncodedFillDescription,
  getOrderKeyHashV3,
} from "./utils";

export async function handleVmOrder(
  orderRequest: CatalystEvent<CatalystOrder>,
) {

  // Initially, we assue that orders only have a single output.
  if (orderRequest.data.order.outputs.length != 1) throw new Error(`Got ${orderRequest.data.order.outputs.length} outputs instead of 1`);
  const output = orderRequest.data.order.outputs[0];

  // Check if solver supports the chains.
  // TODO: check if solver supports both chains
  const originChainId = orderRequest.data.order.originChainId;
  const destinationChainId = output.chainId;

  // Get the contract of the filler.
  // TODO: verify whether this is trusted.
  const fillerAddress = getAddressFromBytes32(output.remoteFiller);

  const fillerContract = new ethers.Contract(
    fillerAddress,
    CoinFillerAbi,
    ethSigner,
  );

  // Get solver's address. The users paid input tokens will go to this address.
  const solverIdentifier = getBytes32FromAddress(ethSigner.address);

  // Get order identifier.
  const orderIdentifier = getOrderKeyHashV3(
    compactSettlerAddress[originChainId],
    orderRequest.data.order,
  );

  console.log({
    fillerAddress,
    solverIdentifier,
    orderIdentifier,
  });

  // approve coin filler to use usdc tokens
  const usdcContract = new ethers.Contract(
    usdcAddress[destinationChainId],
    [
      {
        type: "function",
        name: "approve",
        inputs: [
          { name: "spender", type: "address", internalType: "address" },
          { name: "amount", type: "uint256", internalType: "uint256" },
        ],
        outputs: [{ name: "", type: "bool", internalType: "bool" }],
        stateMutability: "nonpayable",
      },
    ],
    ethSigner,
  );
  console.log("approving...");
  await usdcContract.approve(fillerAddress, output.amount);
  console.log("filler approved");

  console.log("filling...");
  const filledTx = await fillerContract.fill(
    orderIdentifier,
    output,
    solverIdentifier,
  );
  console.log("filled tx", filledTx);

  const waitedFilledTx = (await filledTx.wait(1)) as TransactionReceipt;
  console.log("waitedTx", waitedFilledTx);

  const blockNumber = waitedFilledTx.blockNumber;
  const ethBlock = await ethSigner.provider.getBlock(blockNumber);
  const ethTxTimestamp = ethBlock.timestamp;
  console.log({
    ethBlock,
    ethTxTimestamp,
  });
  if (!ethTxTimestamp) throw new Error("ethTxTimestamp is undefined");

  const wormholeContract = new ethers.Contract(
    whOracleAddress[destinationChainId],
    WormholeOracleAbi,
    ethSigner,
  );
  console.log("encoding bytes");
  const fillDescriptionBytes = getEncodedFillDescription(
    solverIdentifier,
    orderIdentifier,
    ethTxTimestamp,
    output,
  );
  console.log("fillDescriptionBytes", fillDescriptionBytes);
  console.log("submitting...");
  const whTx = await wormholeContract.submit(fillerAddress, [
    fillDescriptionBytes,
  ]);
  console.log("whTx", whTx);
  const whTxAwaited = await whTx.wait(1);
  console.log("whTxAwaited", whTxAwaited);
  // console.log("fill tx", tx);
  // const txReceipt = await provider.getTransactionReceipt(tx.hash);
  // console.log("fill tx receipt", txReceipt);

  const compactOrder = {
    user: orderRequest.data.order.user,
    nonce: orderRequest.data.order.nonce,
    originChainId: orderRequest.data.order.originChainId,
    fillDeadline: orderRequest.data.order.fillDeadline,
    localOracle: orderRequest.data.order.localOracle,
    inputs: orderRequest.data.order.inputs,
    outputs: orderRequest.data.order.outputs,
  };

  const compactSettler = new ethers.Contract(
    compactSettlerAddress[originChainId],
    CompactSettlerAbi,
    baseSigner,
  );
  console.log("finalizing...");
  const finalizeTx = await compactSettler.finaliseSelf(
    compactOrder,
    abi.encode(
      ["bytes", "bytes"],
      [
        orderRequest.data.sponsorSignature,
        orderRequest.data.allocatorSignature,
      ],
    ),
    // TODO: should be dynamic
    [ethTxTimestamp],
    // TODO: this should be correctly fetched
    getBytes32FromAddress(baseSigner.address),
  );
  console.log("finalizeTx", finalizeTx);
  const finalizeTxWaited = await finalizeTx.wait(1);
  console.log("finalizeTxWaited", finalizeTxWaited);

  console.log("order finalized");
  return;
}
