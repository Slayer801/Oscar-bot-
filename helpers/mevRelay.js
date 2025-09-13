const { FlashbotsBundleProvider } = require('@flashbots/ethers-provider-bundle');
const { ethers } = require('ethers');

class MEVRelay {
    constructor(config) {
        this.config = config;
        this.provider = null;
        this.flashbotsProvider = null;
        this.authSigner = null;
        this.relayUrl = 'https://relay.flashbots.net';
        this.connected = false;
    }

    async initialize() {
        try {
            console.log('🚀 Initializing MEV Relay connection...');
            
            // Create ethers provider from environment
            let providerUrl;
            if (process.env.INFURA_API_KEY) {
                providerUrl = `https://polygon-mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`;
            } else {
                throw new Error('INFURA_API_KEY required for MEV relay');
            }
            
            this.provider = new ethers.providers.JsonRpcProvider(providerUrl);
            
            // Create auth signer for Flashbots relay
            this.authSigner = new ethers.Wallet(ethers.Wallet.createRandom().privateKey);
            
            // Initialize Flashbots provider (targeting Polygon mainnet)
            this.flashbotsProvider = await FlashbotsBundleProvider.create(
                this.provider,
                this.authSigner,
                this.relayUrl,
                'polygon'
            );

            this.connected = true;
            console.log('✅ MEV Relay connected to Flashbots');
            console.log(`📡 Relay URL: ${this.relayUrl}`);
            console.log(`🔑 Auth Signer: ${this.authSigner.address}`);
            
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize MEV Relay:', error.message);
            this.connected = false;
            return false;
        }
    }

    async createArbitrageBundle(opportunity, gasConfig) {
        try {
            if (!this.connected) {
                throw new Error('MEV Relay not connected');
            }

            console.log('\n🔨 Constructing MEV bundle for arbitrage...');
            
            const { web3, account, flashloanContract, helpers } = this.config;
            const currentBlock = await this.provider.getBlockNumber();
            const targetBlock = currentBlock + 1;

            // Prepare flash loan transaction
            const flashLoanAmount = web3.utils.toWei('5000000', 'mwei'); // 5M USDC
            const asset = opportunity.tokenAddresses.USDC;
            
            // Encode arbitrage parameters
            const params = web3.eth.abi.encodeParameters(
                ['address', 'address', 'address', 'uint256', 'bool'],
                [
                    opportunity.tokenAddresses.WETH,
                    opportunity.dex1.router,
                    opportunity.dex2.router,
                    opportunity.amountIn,
                    opportunity.direction
                ]
            );

            // Build flash loan transaction
            const flashLoanTx = {
                to: this.config.contractAddress,
                data: flashloanContract.methods.requestFlashLoan(asset, flashLoanAmount, params).encodeABI(),
                gasLimit: gasConfig.gasLimit,
                maxFeePerGas: gasConfig.maxFeePerGas,
                maxPriorityFeePerGas: gasConfig.maxPriorityFeePerGas,
                nonce: await this.provider.getTransactionCount(account.address, 'pending'),
                type: 2
            };

            // Sign transaction
            const signedTx = await account.signTransaction(flashLoanTx);
            
            // Create bundle
            const bundle = [
                {
                    signedTransaction: signedTx.rawTransaction
                }
            ];

            console.log(`📦 Bundle created for block ${targetBlock}`);
            console.log(`💰 Flash loan amount: ${web3.utils.fromWei(flashLoanAmount, 'mwei')} USDC`);
            console.log(`⛽ Max fee: ${web3.utils.fromWei(gasConfig.maxFeePerGas.toString(), 'gwei')} gwei`);

            return {
                bundle,
                targetBlock,
                bundleHash: this.calculateBundleHash(bundle)
            };

        } catch (error) {
            console.error('❌ Failed to create arbitrage bundle:', error.message);
            throw error;
        }
    }

    async submitBundle(bundleData) {
        try {
            if (!this.connected) {
                throw new Error('MEV Relay not connected');
            }

            console.log(`\n📡 Submitting bundle to MEV relay...`);
            console.log(`🎯 Target block: ${bundleData.targetBlock}`);
            
            // Submit bundle to Flashbots
            const bundleResponse = await this.flashbotsProvider.sendBundle(
                bundleData.bundle,
                bundleData.targetBlock
            );

            console.log('✅ Bundle submitted successfully');
            console.log(`📋 Bundle hash: ${bundleData.bundleHash}`);

            // Monitor bundle status
            this.monitorBundle(bundleResponse, bundleData.targetBlock);

            return {
                success: true,
                bundleHash: bundleData.bundleHash,
                targetBlock: bundleData.targetBlock,
                response: bundleResponse
            };

        } catch (error) {
            console.error('❌ Bundle submission failed:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async monitorBundle(bundleResponse, targetBlock) {
        try {
            console.log(`\n👁️ Monitoring bundle for block ${targetBlock}...`);
            
            // Wait for bundle resolution
            const resolution = await bundleResponse.wait();
            
            if (resolution === 0) {
                console.log('✅ Bundle included in block!');
                return { included: true, block: targetBlock };
            } else {
                console.log('⏰ Bundle not included (timeout or competition)');
                return { included: false, reason: 'timeout_or_competition' };
            }

        } catch (error) {
            console.error('❌ Bundle monitoring error:', error.message);
            return { included: false, error: error.message };
        }
    }

    async simulateBundle(bundleData) {
        try {
            if (!this.connected) {
                throw new Error('MEV Relay not connected');
            }

            console.log('🧪 Simulating bundle...');
            
            const simulation = await this.flashbotsProvider.simulate(
                bundleData.bundle,
                bundleData.targetBlock
            );

            if (simulation.error) {
                console.log('❌ Bundle simulation failed:', simulation.error);
                return { success: false, error: simulation.error };
            }

            console.log('✅ Bundle simulation successful');
            console.log(`💰 Estimated profit: ${simulation.coinbaseDiff} wei`);
            
            return {
                success: true,
                profit: simulation.coinbaseDiff,
                gasUsed: simulation.totalGasUsed,
                simulation
            };

        } catch (error) {
            console.error('❌ Bundle simulation error:', error.message);
            return { success: false, error: error.message };
        }
    }

    async getBundleStats(bundleHash, blockNumber) {
        try {
            const stats = await this.flashbotsProvider.getBundleStatsV2(bundleHash, blockNumber);
            console.log(`📊 Bundle stats:`, stats);
            return stats;
        } catch (error) {
            console.error('❌ Failed to get bundle stats:', error.message);
            return null;
        }
    }

    calculateBundleHash(bundle) {
        // Create a deterministic hash for bundle tracking
        const txHashes = bundle.map(tx => 
            ethers.utils.keccak256(tx.signedTransaction)
        );
        return ethers.utils.keccak256(ethers.utils.concat(txHashes));
    }

    isConnected() {
        return this.connected;
    }

    getRelayInfo() {
        return {
            connected: this.connected,
            relayUrl: this.relayUrl,
            authSigner: this.authSigner?.address
        };
    }
}

module.exports = MEVRelay;