# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Install dependencies
npm install

# Development server with hot reload
npm run start:dev

# Build the application
npm run build

# Run tests
npm test
npm run test:watch    # Watch mode
npm run test:e2e      # End-to-end tests

# Linting and formatting
npm run lint          # ESLint with auto-fix
npm run format        # Prettier formatting

# Production
npm run start:prod
```

## Architecture Overview

This is a Catalyst example solver built with NestJS that demonstrates the flow for getting and filling intents in the Catalyst intent system. **This is not production-ready code** - it's an educational example.

### Key Components

- **OrderServerService** (`src/services/order-server.service.ts`): Primary order collection service using WebSocket connections to the LI.FI order server for real-time order streaming. Includes HTTP API fallback for historical data and order management
- **OnchainOrderService** (`src/services/onchain-order.service.ts`): Alternative order collection method that polls blockchain events directly from CompactSettler contracts (currently disabled by default)
- **IntentoryDispatcher** (`src/inventory/intentory-dispatcher.ts`): Periodically pushes inventory data to the order server every 5 seconds, defining what assets the solver can handle with pricing and limits
- **Event Handlers** (`src/handlers/`): 
  - `quote-request.handler.ts`: Handles quote requests by simulating pricing using CoinGecko data with 20% discount
  - `vm-order.handler.ts`: Handles complete order execution lifecycle including cross-chain fills, oracle validation, and asset settlement
- **External Integration** (`src/external/`):
  - Asset mapping for CoinGecko API integration
  - Real-time price fetching for dynamic quote generation
- **Smart Contracts** (`abi/`): Contract ABIs for interacting with Catalyst protocol contracts (CoinFiller, CompactSettler, WormholeOracle)

### Key Flows

1. **Order Collection** (Primary): Real-time order streaming via WebSocket connection to LI.FI order server
   - Subscribes to `new_order` and `order_updated` events for supported chains
   - Automatic reconnection with exponential backoff (max 5 attempts)
   - HTTP API fallback for historical orders and specific queries
   - Initial order fetching on startup for existing "Signed" and "Delivered" orders

2. **Alternative Order Collection**: On-chain event polling (currently disabled)
   - Monitors `Finalised`, `OrderPurchased`, and `Deposited` events from CompactSettler contracts
   - 5-second polling interval with block-based progress tracking

3. **Inventory Management**: Solver advertises available assets and pricing via periodic API calls
   - Updates every 5 seconds with 8-second quote expiry
   - Supports USDC, USDT, and WETH across Sepolia, Base, Optimism, and Arbitrum testnets

4. **Quote Handling**: Responds to quote requests with dynamic pricing
   - Real-time price fetching from CoinGecko API
   - 20% discount applied for competitive pricing
   - 30-second quote validity period

5. **Order Execution**: Complete cross-chain order fulfillment pipeline:
   - **Validation**: Chain support, expiration, and single-output verification
   - **Token Approval**: ERC20 approve transactions for CoinFiller contracts
   - **Intent Fill**: Execute `fillOrderOutputs` on destination chain CoinFiller
   - **Cross-chain Validation**: Oracle-based proof submission (Wormhole or Polymer)
   - **Asset Settlement**: Final `finalise` call on origin chain CompactSettler with signatures

### Configuration

Environment variables are required for:
- `SOLVER_ADDRESS`, `SOLVER_PK`: Solver identity and private key for transaction signing
- RPC URLs for supported chains:
  - `SEPOLIA_RPC_URL` (or fallback to Infura)
  - `BASE_SEPOLIA_RPC_URL` (or fallback to https://sepolia.base.org)
  - `OPTIMISM_SEPOLIA_RPC_URL` (or fallback to https://sepolia.optimism.io)
  - `ARBITRUM_SEPOLIA_RPC_URL` (or fallback to https://sepolia-rollup.arbitrum.io/rpc)
- Order server configuration:
  - `ORDER_SERVER_API_KEY`: Authentication for LI.FI order server
  - `ORDER_SERVER_BASE_URL`: HTTP API base URL (default: https://order-dev.li.fi)
  - `ORDER_SERVER_WS_URL`: WebSocket URL (default: wss://order-dev.li.fi)
- Optional WebSocket settings:
  - `WS_RECONNECT_ATTEMPTS`: Max reconnection attempts (default: 5)
  - `WS_RECONNECT_DELAY`: Delay between reconnects in ms (default: 5000)
  - `WS_PING_INTERVAL`: Health check interval in ms (default: 30000)
- Optional: `OZ_RELAYER_API_KEY`, `OZ_RELAYER_API_SECRET` for OpenZeppelin relayers

### Smart Contract Integration

The solver interacts with multiple contracts across all supported testnets:

#### Contract Addresses (All chains use same addresses)
- **CompactSettler**: `0xb0567293b367e8Ed99cd44cDa1743980F2e6BBB2` - Order finalization on origin chains
- **CoinFiller**: `0x00000000cDd3B32d6eAc30AD7E3c3A26FD1b9e0F` - Token fills on destination chains  
- **WormholeOracle**: `0x98f3c9e6E3fAce36bAAd05FE09d375Ef1464288B` - Cross-chain message verification
- **PolymerOracle**: `0xca200b41459BF9a1C7EA7F1F22610281Bfb3a8AB` - Alternative cross-chain verification

#### Supported Chains
- **Sepolia** (11155111): Ethereum testnet
- **Base Sepolia** (84532): Base testnet
- **Optimism Sepolia** (11155420): Optimism testnet  
- **Arbitrum Sepolia** (421614): Arbitrum testnet

#### Token Addresses per Chain
- **USDC**: Different addresses per chain (e.g., `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` on Sepolia)
- **USDT**: Chain-specific addresses for testing
- **WETH**: Wrapped ETH addresses per chain

Uses TypeChain for type-safe contract interactions (generated via `postinstall` script).

### Oracle Integration Details

The solver supports dual oracle systems:
- **Wormhole Oracle**: Uses VAA (Verifiable Action Approval) for cross-chain verification
- **Polymer Oracle**: HTTP-based proof generation with exponential backoff retry (up to 10 attempts)
- **Automatic Selection**: Based on `order.localOracle` address with Wormhole as fallback

### Testing and Libraries

- Uses custom NestJS modules in `libs/` for configuration and logging
- Leverages `@catalabs/catalyst-sdk` for protocol-specific utilities
- Bitcoin and Ethereum utilities for address validation and transaction handling
- Ethers.js v6 for blockchain interactions with 1-block confirmation waits