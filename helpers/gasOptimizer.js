const { Web3 } = require('web3');

class GasOptimizer {
    constructor(web3Instance) {
        this.web3 = web3Instance;
        this.gasCache = {
            timestamp: 0,
            prices: null,
            ttl: 5000 // 5 seconds cache
        };
    }

    async getCurrentGasPrices() {
        const now = Date.now();
        
        // Return cached data if still valid
        if (this.gasCache.timestamp + this.gasCache.ttl > now && this.gasCache.prices) {
            return this.gasCache.prices;
        }

        try {
            // Get current network gas price
            const networkGasPrice = await this.web3.eth.getGasPrice();
            const basePriceGwei = parseFloat(this.web3.utils.fromWei(networkGasPrice, 'gwei'));

            // Calculate optimized gas prices for different speeds
            const gasPrices = {
                slow: Math.round(basePriceGwei * 1.0),      // Network base price
                standard: Math.round(basePriceGwei * 1.2),  // 20% above base
                fast: Math.round(basePriceGwei * 1.5),      // 50% above base
                fastest: Math.round(basePriceGwei * 2.0),   // 100% above base (for MEV competition)
                network: basePriceGwei
            };

            // Cache the result
            this.gasCache = {
                timestamp: now,
                prices: gasPrices,
                ttl: this.gasCache.ttl
            };

            return gasPrices;
        } catch (error) {
            console.error('Failed to fetch gas prices:', error.message);
            
            // Fallback to reasonable defaults for Polygon
            return {
                slow: 30,
                standard: 35,
                fast: 45,
                fastest: 60,
                network: 30
            };
        }
    }

    async getOptimalGasPrice(priority = 'fastest') {
        const prices = await this.getCurrentGasPrices();
        const gasPrice = prices[priority] || prices.fastest;
        
        // Convert back to wei
        return this.web3.utils.toWei(gasPrice.toString(), 'gwei');
    }

    async estimateGasWithBuffer(transaction, bufferMultiplier = 1.1) {
        try {
            const gasEstimate = await this.web3.eth.estimateGas(transaction);
            return Math.round(Number(gasEstimate) * bufferMultiplier);
        } catch (error) {
            console.error('Gas estimation failed:', error.message);
            // Fallback to conservative estimate
            return 500000;
        }
    }

    async createOptimizedTransaction(transaction, priority = 'fastest') {
        const gasPrice = await this.getOptimalGasPrice(priority);
        const gasLimit = await this.estimateGasWithBuffer(transaction);

        // Use legacy gas pricing for Polygon (more reliable)
        return {
            ...transaction,
            gasPrice: gasPrice,
            gas: gasLimit
        };
    }

    logGasInfo(gasPrices, usedPriority = 'fastest') {
        console.log('\n🔥 GAS OPTIMIZATION INFO:');
        console.log(`Network Base: ${gasPrices.network} gwei`);
        console.log(`Slow: ${gasPrices.slow} gwei`);
        console.log(`Standard: ${gasPrices.standard} gwei`);
        console.log(`Fast: ${gasPrices.fast} gwei`);
        console.log(`Fastest: ${gasPrices.fastest} gwei`);
        console.log(`🚀 Using: ${gasPrices[usedPriority]} gwei (${usedPriority})\n`);
    }
}

module.exports = GasOptimizer;