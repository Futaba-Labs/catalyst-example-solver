import { CatalystWsEventType } from 'src/types/events';
import { assetMap } from '../external/asset-map';
import { getCoingeckoPricesByIds } from '../external/coingecko';
import { CatalystEvent, CatalystQuoteRequestData } from 'src/types';
import { WebSocket } from 'ws';
import { wait } from 'src/utils';

const QUOTE_VALID_FOR_MS = 30_000;

export async function handleQuoteRequest(
  parsedData: CatalystEvent<CatalystQuoteRequestData>,
  ws: WebSocket,
) {
  try {
    const quote = await simulateSolverQuote(
      parsedData.data.fromAsset,
      parsedData.data.toAsset,
      parsedData.data.amount,
    );

    await wait(750);

    console.log('Proposed quote', quote);
    ws.send(
      JSON.stringify({
        event: CatalystWsEventType.SOLVER_QUOTE,
        data: {
          quoteRequestId: parsedData.data.quoteRequestId,
          ...quote,
        },
      }),
    );
  } catch (error) {
    console.error('Error simulating quote:', error);
  }
}

async function simulateSolverQuote(
  fromAsset: string,
  toAsset: string,
  amount = '1',
) {
  const fromAssetId = assetMap[fromAsset].coingecko;
  const toAssetId = assetMap[toAsset].coingecko;

  const assetPrices = await getCoingeckoPricesByIds(
    [fromAssetId, toAssetId],
    'usd',
  );

  const fromPrice = assetPrices[fromAssetId].usd;
  const toPrice = assetPrices[toAssetId].usd;

  const conversionRate = toPrice / fromPrice;
  const conversionAmount = (Number(amount) * fromPrice) / toPrice;

  return {
    fromAsset,
    toAsset,
    fromPrice,
    toPrice,
    conversionRate,
    amount: conversionAmount*0.8,
    expirationTime: new Date().getTime() + QUOTE_VALID_FOR_MS,
    discount: '',
    intermediary: 'USD',
  };
}
