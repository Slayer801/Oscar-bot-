const { Web3 } = require('web3');

class MempoolMonitor {
    constructor(web3Instance, config) {
        this.web3 = web3Instance;
        this.config = config;
        this.isMonitoring = false;
        this.subscription = null;
        this.targetPairs = new Set();
        this.dexRouters = new Map();
        
        // DEX router addresses and their method signatures
        this.swapSignatures = [
            '0x38ed1739', // swapExactTokensForTokens
            '0x8803dbee', // swapTokensForExactTokens
            '0x7ff36ab5', // swapExactETHForTokens
            '0x18cbafe5', // swapTokensForExactETH
            '0x791ac947', // swapExactTokensForETHSupportingFeeOnTransferTokens
            '0xb6f9de95'  // swapExactETHForTokensSupportingFeeOnTransferTokens
        ];
    }

    addTargetPair(token0Address, token1Address) {
        const pairKey = this.createPairKey(token0Address, token1Address);
        this.targetPairs.add(pairKey);
        console.log(`📊 Monitoring mempool for pair: ${pairKey}`);
    }

    addDexRouter(name, routerAddress) {
        this.dexRouters.set(routerAddress.toLowerCase(), name);
        console.log(`🏦 Added DEX router: ${name} at ${routerAddress}`);
    }

    createPairKey(token0, token1) {
        // Normalize pair key (always put smaller address first)
        const addresses = [token0.toLowerCase(), token1.toLowerCase()].sort();
        return `${addresses[0]}-${addresses[1]}`;
    }

    isSwapTransaction(txData) {
        if (!txData || txData.length < 10) return false;
        const methodId = txData.substring(0, 10);
        return this.swapSignatures.includes(methodId);
    }

    parseSwapTransaction(tx) {
        try {
            const routerName = this.dexRouters.get(tx.to?.toLowerCase());
            if (!routerName) return null;

            // Basic transaction info
            const swapInfo = {
                hash: tx.hash,
                from: tx.from,
                to: tx.to,
                value: tx.value,
                gasPrice: tx.gasPrice,
                gasLimit: tx.gas,
                router: routerName,
                methodId: tx.input?.substring(0, 10),
                timestamp: Date.now()
            };

            // Try to extract token addresses from transaction data
            if (tx.input && tx.input.length > 10) {
                const data = tx.input.substring(10); // Remove method signature
                swapInfo.inputData = data;
                
                // Basic parsing - in production you'd want more sophisticated ABI decoding
                swapInfo.estimatedTokens = this.extractTokenAddresses(data);
            }

            return swapInfo;
        } catch (error) {
            console.log('Error parsing swap transaction:', error.message);
            return null;
        }
    }

    extractTokenAddresses(hexData) {
        // Simple heuristic to extract token addresses from swap data
        // In production, you'd use proper ABI decoding
        const addresses = [];
        const addressPattern = /[0-9a-fA-F]{40}/g;
        let match;
        
        while ((match = addressPattern.exec(hexData)) !== null) {
            const address = '0x' + match[0];
            if (this.isValidAddress(address)) {
                addresses.push(address.toLowerCase());
            }
        }
        
        return [...new Set(addresses)]; // Remove duplicates
    }

    isValidAddress(address) {
        return this.web3.utils.isAddress(address);
    }

    checkArbitrageOpportunity(swapInfo) {
        // Check if this swap involves our target pairs
        const extractedTokens = swapInfo.estimatedTokens || [];
        
        for (const pairKey of this.targetPairs) {
            const [token0, token1] = pairKey.split('-');
            
            // Check if swap involves our monitored tokens
            const hasToken0 = extractedTokens.some(addr => addr === token0);
            const hasToken1 = extractedTokens.some(addr => addr === token1);
            
            if (hasToken0 && hasToken1) {
                return {
                    opportunity: true,
                    pairKey,
                    token0,
                    token1,
                    swapInfo,
                    detectedAt: Date.now()
                };
            }
        }
        
        return { opportunity: false };
    }

    async startMonitoring(onOpportunityCallback) {
        if (this.isMonitoring) {
            console.log('⚠️ Mempool monitoring already active');
            return;
        }

        try {
            console.log('🚀 Starting mempool monitoring...');
            
            // Try to subscribe to pending transactions
            try {
                this.subscription = await this.web3.eth.subscribe('pendingTransactions');
                
                this.subscription.on('data', async (txHash) => {
                    try {
                        // Get transaction details
                        const tx = await this.web3.eth.getTransaction(txHash);
                        
                        if (!tx || !tx.to) return;
                        
                        // Check if it's a DEX swap
                        if (this.isSwapTransaction(tx.input)) {
                            const swapInfo = this.parseSwapTransaction(tx);
                            
                            if (swapInfo) {
                                // Check for arbitrage opportunity
                                const opportunity = this.checkArbitrageOpportunity(swapInfo);
                                
                                if (opportunity.opportunity) {
                                    console.log(`\n⚡ MEMPOOL ARBITRAGE DETECTED!`);
                                    console.log(`Router: ${swapInfo.router}`);
                                    console.log(`Pair: ${opportunity.pairKey}`);
                                    console.log(`TX: ${txHash}`);
                                    console.log(`Gas: ${this.web3.utils.fromWei(swapInfo.gasPrice || '0', 'gwei')} gwei\n`);
                                    
                                    // Trigger arbitrage callback
                                    if (onOpportunityCallback) {
                                        onOpportunityCallback(opportunity);
                                    }
                                }
                            }
                        }
                    } catch (error) {
                        // Silently handle individual tx processing errors
                        // (some pending txs may disappear before we can fetch them)
                    }
                });

                this.subscription.on('error', (error) => {
                    console.error('❌ Mempool subscription error:', error.message);
                    this.stopMonitoring();
                });

                this.isMonitoring = true;
                console.log('✅ Mempool monitoring active - watching for arbitrage opportunities');
                
            } catch (subscriptionError) {
                console.log('⚠️ Pending transaction subscriptions not supported by provider');
                console.log('🔄 Falling back to block-based monitoring for faster detection');
                
                // Fallback: Monitor new blocks and process recent transactions quickly
                this.startBlockBasedMonitoring(onOpportunityCallback);
            }
            
        } catch (error) {
            console.error('❌ Failed to start mempool monitoring:', error.message);
            this.isMonitoring = false;
        }
    }

    async startBlockBasedMonitoring(onOpportunityCallback) {
        try {
            // Subscribe to new block headers
            this.subscription = await this.web3.eth.subscribe('newBlockHeaders');
            
            this.subscription.on('data', async (blockHeader) => {
                try {
                    // Get full block with transactions
                    const block = await this.web3.eth.getBlock(blockHeader.number, true);
                    
                    if (block && block.transactions) {
                        // Process transactions quickly
                        for (const tx of block.transactions) {
                            if (tx.to && this.isSwapTransaction(tx.input)) {
                                const swapInfo = this.parseSwapTransaction(tx);
                                
                                if (swapInfo) {
                                    const opportunity = this.checkArbitrageOpportunity(swapInfo);
                                    
                                    if (opportunity.opportunity) {
                                        console.log(`\n⚡ BLOCK-BASED ARBITRAGE DETECTED!`);
                                        console.log(`Block: ${blockHeader.number}`);
                                        console.log(`Router: ${swapInfo.router}`);
                                        console.log(`Pair: ${opportunity.pairKey}`);
                                        console.log(`TX: ${tx.hash}\n`);
                                        
                                        if (onOpportunityCallback) {
                                            onOpportunityCallback(opportunity);
                                        }
                                    }
                                }
                            }
                        }
                    }
                } catch (error) {
                    // Silently handle block processing errors
                }
            });

            this.subscription.on('error', (error) => {
                console.error('❌ Block subscription error:', error.message);
                this.stopMonitoring();
            });

            this.isMonitoring = true;
            console.log('✅ Block-based monitoring active - faster than event-only detection');
            
        } catch (error) {
            console.error('❌ Failed to start block-based monitoring:', error.message);
            this.isMonitoring = false;
        }
    }

    stopMonitoring() {
        if (this.subscription) {
            this.subscription.unsubscribe();
            this.subscription = null;
        }
        this.isMonitoring = false;
        console.log('⏹️ Mempool monitoring stopped');
    }

    getStatus() {
        return {
            isMonitoring: this.isMonitoring,
            targetPairs: Array.from(this.targetPairs),
            dexRouters: Object.fromEntries(this.dexRouters),
            swapSignatures: this.swapSignatures
        };
    }
}

module.exports = MempoolMonitor;