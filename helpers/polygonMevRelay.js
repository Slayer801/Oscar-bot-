const WebSocket = require('ws');

class PolygonMEVRelay {
    constructor(config) {
        this.config = config;
        this.wsUrl = 'wss://api.blxrbdn.com/ws';
        this.connected = false;
        this.authHeader = null;
        this.websocket = null;
        this.requestId = 1;
    }

    async initialize() {
        try {
            console.log('🚀 Initializing Polygon MEV Relay (bloXroute)...');
            
            // Check for bloXroute authorization header
            this.authHeader = process.env.BLOXROUTE_AUTH_HEADER;
            if (!this.authHeader) {
                console.log('⚠️ BLOXROUTE_AUTH_HEADER not found - private transactions unavailable');
                console.log('💡 Add BLOXROUTE_AUTH_HEADER to environment for MEV protection');
                this.connected = false;
                return false;
            }

            // Test WebSocket connection with authentication
            try {
                await this.testConnection();
                this.connected = true;
                console.log('✅ Polygon MEV Relay connected via bloXroute');
                console.log(`📡 Service: polygon_private_tx (front-running protection)`);
                console.log(`⚡ Speed advantage: 400-1000ms faster than public mempool`);
                console.log(`🔐 Authentication: Verified`);
                
                return true;
            } catch (error) {
                console.log('❌ bloXroute authentication failed:', error.message);
                console.log('💡 Check your BLOXROUTE_AUTH_HEADER value');
                this.connected = false;
                return false;
            }
            
        } catch (error) {
            console.error('❌ Failed to initialize Polygon MEV Relay:', error.message);
            this.connected = false;
            return false;
        }
    }

    async testConnection() {
        return new Promise((resolve, reject) => {
            const testWs = new WebSocket(this.wsUrl, {
                headers: {
                    'Authorization': this.authHeader
                }
            });

            const timeout = setTimeout(() => {
                testWs.close();
                reject(new Error('Connection timeout'));
            }, 5000);

            testWs.on('open', () => {
                clearTimeout(timeout);
                testWs.close();
                resolve(true);
            });

            testWs.on('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
        });
    }

    async submitPrivateTransaction(signedTransaction) {
        try {
            if (!this.connected) {
                throw new Error('Polygon MEV Relay not connected');
            }

            console.log('\n🎯 Submitting private transaction to bloXroute...');
            
            return new Promise((resolve, reject) => {
                const ws = new WebSocket(this.wsUrl, {
                    headers: {
                        'Authorization': this.authHeader
                    }
                });

                const requestId = this.requestId++;
                const timeout = setTimeout(() => {
                    ws.close();
                    reject(new Error('Private transaction submission timeout'));
                }, 10000);

                ws.on('open', () => {
                    console.log('📡 Connected to bloXroute WebSocket');
                    
                    const request = {
                        jsonrpc: "2.0",
                        id: requestId,
                        method: "polygon_private_tx",
                        params: {
                            transaction: signedTransaction
                        }
                    };

                    console.log('📡 Sending to polygon_private_tx method...');
                    ws.send(JSON.stringify(request));
                });

                ws.on('message', (data) => {
                    try {
                        const response = JSON.parse(data.toString());
                        
                        if (response.id === requestId) {
                            clearTimeout(timeout);
                            ws.close();
                            
                            if (response.error) {
                                console.error('❌ bloXroute API error:', response.error);
                                resolve({
                                    success: false,
                                    error: response.error.message || 'API error',
                                    code: response.error.code
                                });
                            } else {
                                console.log('✅ Private transaction submitted successfully!');
                                console.log(`📦 Transaction hash: ${response.result}`);
                                console.log(`🏆 Front-running protection: ACTIVE`);
                                console.log(`⚡ Private mempool routing: 400-1000ms faster`);
                                
                                resolve({
                                    success: true,
                                    txHash: response.result,
                                    response: response
                                });
                            }
                        }
                    } catch (parseError) {
                        clearTimeout(timeout);
                        ws.close();
                        reject(new Error('Failed to parse response: ' + parseError.message));
                    }
                });

                ws.on('error', (error) => {
                    clearTimeout(timeout);
                    reject(new Error('WebSocket error: ' + error.message));
                });

                ws.on('close', (code, reason) => {
                    clearTimeout(timeout);
                    if (code !== 1000) {
                        reject(new Error(`WebSocket closed unexpectedly: ${code} ${reason}`));
                    }
                });
            });

        } catch (error) {
            console.error('❌ Private transaction submission failed:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async getTransactionStatus(txHash) {
        try {
            const headers = this.apiKey ? { 'Authorization': this.apiKey } : {};
            
            const response = await axios.get(
                `${this.baseUrl}/v1/tx/${txHash}`,
                { headers }
            );

            return response.data;
        } catch (error) {
            console.error('❌ Failed to get transaction status:', error.message);
            return null;
        }
    }

    isConnected() {
        return this.connected;
    }

    getRelayInfo() {
        return {
            connected: this.connected,
            service: 'bloXroute polygon_private_tx',
            network: 'Polygon',
            protection: 'Front-running protection',
            authHeader: this.authHeader ? 'Configured' : 'Missing',
            endpoint: 'wss://api.blxrbdn.com/ws'
        };
    }

    // Create transaction for private submission
    async createPrivateArbitrageTx(routerPath, token0Contract, token1Contract, amount, account) {
        try {
            const { web3, arbitrage, gasOptimizer } = this.config;
            
            console.log('🔨 Creating optimized arbitrage transaction...');
            
            // Determine direction
            const startOnQuickswap = (routerPath[0]._address === this.config.qRouter._address);
            
            // Build transaction data
            const arbitrageTransaction = {
                'from': account,
                'to': arbitrage._address,
                'data': arbitrage.methods.executeTrade(
                    startOnQuickswap, 
                    token0Contract._address, 
                    token1Contract._address, 
                    amount
                ).encodeABI()
            };
            
            // Optimize with dynamic gas pricing
            const optimizedTx = await gasOptimizer.createOptimizedTransaction(arbitrageTransaction, 'fastest');
            
            console.log(`⚡ Gas Price: ${web3.utils.fromWei(optimizedTx.gasPrice, 'gwei')} gwei`);
            console.log(`⚡ Gas Limit: ${optimizedTx.gas}`);
            
            // Sign transaction
            const signedTx = await web3.eth.accounts.signTransaction(
                optimizedTx, 
                process.env.DEPLOYMENT_ACCOUNT_KEY
            );
            
            return {
                signedTransaction: signedTx.rawTransaction,
                txData: optimizedTx
            };
            
        } catch (error) {
            console.error('❌ Failed to create private arbitrage transaction:', error.message);
            throw error;
        }
    }
}

module.exports = PolygonMEVRelay;