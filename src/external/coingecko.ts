import "dotenv/config";
import axios from "axios";

const BASE_URL = process.env.COINGECKO_URI;

interface CoinGeckoTokenListItem {
  id: string;
  symbol: string;
  name: string;
  platforms: {
    [key: string]: string;
  };
}

export const getCoingeckoSupportedTokens = async () => {
  try {
    const response = await axios.get(`${BASE_URL}/coins/list`, {
      params: {
        include_platform: true,
      },
      headers: {
        accept: "application/json",
      },
    });
    return response.data as CoinGeckoTokenListItem[];
  } catch (error) {
    console.error("Error fetching supported currencies:", error);
    throw error;
  }
};

export const getCoingeckoPricesByIds = async (
  coinIds: string[],
  vsCurrency = "usd",
) => {
  try {
    const response = await axios.get(`${BASE_URL}/simple/price`, {
      params: {
        ids: coinIds,
        vs_currencies: vsCurrency,
      },
      headers: {
        accept: "application/json",
      },
    });
    return response.data;
  } catch (error) {
    console.error("Error fetching token prices:", error);
    throw error;
  }
};

export const getCoingeckoPriceByTokenAddress = async (
  platformId: string,
  contractAddress: string,
  vsCurrency = "usd",
) => {
  try {
    const response = await axios.get(
      `${BASE_URL}/simple/token_price/${platformId}`,
      {
        params: {
          contract_addresses: contractAddress,
          vs_currencies: vsCurrency,
        },
        headers: {
          accept: "application/json",
        },
      },
    );
    return response.data;
  } catch (error) {
    console.error("Error fetching token price:", error);
    throw error;
  }
};
