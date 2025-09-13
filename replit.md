# Overview

This is a Polygon arbitrage bot that exploits price discrepancies for token pairs between multiple decentralized exchanges (QuickSwap, SushiSwap, and Uniswap) on the Polygon mainnet. The bot utilizes Aave flash loans to perform capital-free arbitrage trades, maximizing profits from temporary price differences across these DEXs.

The system monitors both event-based opportunities and mempool transactions to detect arbitrage opportunities in real-time. When profitable opportunities are identified, the bot executes flash loan-based arbitrage trades through a deployed smart contract.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Core Components

**Flash Loan Integration**: The system is built around Aave's flash loan protocol, allowing the bot to borrow assets without collateral for arbitrage execution. The smart contract handles the entire flash loan lifecycle - borrowing, executing arbitrage trades, repaying the loan, and capturing profits.

**Multi-DEX Price Monitoring**: The bot continuously monitors price differences across three major Polygon DEXs:
- QuickSwap (primary router)
- SushiSwap 
- Uniswap V3

Each DEX integration includes factory and router contracts for liquidity pair discovery and trade execution.

**Real-time Opportunity Detection**: Two complementary monitoring systems work together:
- Event-based monitoring that listens for swap events on target trading pairs
- Mempool monitoring that analyzes pending transactions to frontrun profitable opportunities

**Gas Optimization**: A dedicated gas optimizer component calculates optimal gas prices for different transaction speeds (slow, standard, fast, fastest) to ensure profitable execution while competing with other MEV bots.

**MEV Protection**: Integration with bloXroute's private mempool service provides front-running protection and faster transaction execution (400-1000ms advantage over public mempool).

## Smart Contract Architecture

**Flash Loan Contract**: Deployed at address `0xaeAd1557bf84681968667b428fa75252a8b84092`, this contract inherits from Aave's FlashLoanReceiverBase and implements the arbitrage logic. It handles the complete arbitrage flow within a single transaction block.

**Multi-Router Support**: The contract is configured to work with multiple DEX routers simultaneously, allowing it to execute trades across different exchanges within the same flash loan transaction.

## Execution Flow

**Opportunity Detection**: The system identifies arbitrage opportunities by comparing prices across DEXs and calculating potential profits after accounting for gas costs and flash loan fees.

**Profitable Trade Execution**: When a profitable opportunity is detected, the bot:
1. Initiates a flash loan for the required token amount
2. Executes buy/sell trades across different DEXs
3. Repays the flash loan with fees
4. Captures the remaining profit

**Cluster-based Reliability**: The application uses Node.js clustering with automatic worker process respawning to ensure continuous operation even if individual processes crash.

# External Dependencies

**Blockchain Infrastructure**: 
- Infura WebSocket connections for real-time Polygon mainnet access
- Alchemy as backup RPC provider
- Web3.js for blockchain interactions

**DEX Protocols**:
- Uniswap V3 SDK and contracts
- SushiSwap router and factory contracts  
- QuickSwap router and factory contracts
- Aave V2 flash loan protocol

**MEV and Optimization Services**:
- bloXroute Network for private mempool access and MEV protection
- Flashbots bundle provider for MEV-resistant transaction submission

**Development and Deployment**:
- Truffle framework for smart contract compilation and deployment
- HDWallet Provider for transaction signing
- OpenZeppelin contracts for ERC-20 token interactions

**Monitoring and Analytics**:
- Express.js server for health checks and monitoring
- WebSocket connections for real-time price and mempool monitoring
- Big.js library for precise decimal arithmetic in trading calculations