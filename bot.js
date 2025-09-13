var cluster = require('cluster');
if (cluster.isMaster) {
cluster.fork();
const keep_alive = require('./keep_alive.js');
cluster.on('exit', function(worker, code, signal) {
cluster.fork();
});
}

if (cluster.isWorker) {
// put your code here
// -- HANDLE INITIAL SETUP -- //

require('./helpers/server')  
require("dotenv").config();  

const config = require('./config.json')  
const { getTokenAndContract, getPairContract, calculatePrice, calculatePriceSixAndEighteen, calculatePriceNineAndEighteen, calculatePriceSixAndNine, getEstimatedReturn, getReserves } = require('./helpers/helpers')  
const { uFactory, uRouter, sFactory, sRouter, qFactory, qRouter, web3, arbitrage, gasOptimizer, mempoolMonitor, polygonMevRelay } = require('./helpers/initialization')  

// -- .ENV VALUES HERE -- //  

const arbFor = process.env.ARB_FOR // This is the address of token we are attempting to arbitrage (TOKEN_1)  
const arbAgainst = process.env.ARB_AGAINST // TOKEN_2  
const account = process.env.ACCOUNT // Account to recieve profit  
const units = process.env.UNITS // Used for price display/reporting  
const difference = process.env.PRICE_DIFFERENCE  
const gas = process.env.GAS_LIMIT  
const estimatedGasCost = process.env.GAS_PRICE // Estimated Gas  

let uPair, sPair, amount  
let isExecuting = false

// Unified arbitrage opportunity handler
const handleMempoolOpportunity = async (opportunity) => {
    if (isExecuting) {
        console.log('⚠️ Mempool opportunity detected but bot is busy executing another trade');
        return;
    }
    
    console.log(`
⚡ MEMPOOL ARBITRAGE OPPORTUNITY DETECTED!`);
    console.log(`Pair: ${opportunity.pairKey}`);
    console.log(`Router: ${opportunity.swapInfo.router}`);
    console.log(`TX Hash: ${opportunity.swapInfo.hash}`);
    
    // Execute the same arbitrage logic as event-based detection
    await executeArbitrageFlow('Mempool', opportunity.token0, opportunity.token1);
};

// Unified arbitrage execution flow
const executeArbitrageFlow = async (source, token0Address, token1Address) => {
    if (isExecuting) return;
    
    isExecuting = true;
    
    try {
        // Get token contracts
        const { token0Contract, token1Contract, token0, token1 } = await getTokenAndContract(token0Address, token1Address);
        
        const priceDifference = await checkPrice(source, token0, token1);
        const routerPath = await determineDirection(priceDifference);

        if (!routerPath) {
            console.log(`No Arbitrage Currently Available\n`);
            console.log(`-----------------------------------------\n`);
            return;
        }

        const isProfitable = await determineProfitability(routerPath, token0Contract, token0, token1);

        if (!isProfitable) {
            console.log(`No Arbitrage Currently Available\n`);
            console.log(`-----------------------------------------\n`);
            return;
        }

        const receipt = await executeTrade(routerPath, token0Contract, token1Contract);
        console.log(`✅ ${source} arbitrage executed successfully!`);
        
    } catch (error) {
        console.error(`❌ ${source} arbitrage failed:`, error.message);
    } finally {
        isExecuting = false;
    }
};  

const main = async () => {  
    const { token0Contract, token1Contract, token0, token1 } = await getTokenAndContract(arbFor, arbAgainst)  
    uPair = await getPairContract(qFactory, token0.address, token1.address)  
    sPair = await getPairContract(sFactory, token0.address, token1.address)  

    // Initialize Polygon MEV relay for private transaction submission
    console.log('🚀 Initializing Polygon MEV Relay for competitive arbitrage...');
    await polygonMevRelay.initialize();

    // Configure mempool monitoring for our target pair
    mempoolMonitor.addTargetPair(token0.address, token1.address);
    
    // Start mempool monitoring with arbitrage opportunity callback
    await mempoolMonitor.startMonitoring(handleMempoolOpportunity);


    uPair.events.Swap({}, async () => {  
        await executeArbitrageFlow('Quickswap Event', token0.address, token1.address);
    })  

    sPair.events.Swap({}, async () => {  
        await executeArbitrageFlow('Sushiswap Event', token0.address, token1.address);
    })  

    console.log("🔍 MEV Bot Active:");
    console.log("📊 Event-based monitoring: Waiting for swap events...");
    console.log("⚡ Mempool monitoring: Scanning pending transactions...");
    console.log("🎯 Target pair: " + token0.symbol + "/" + token1.symbol);
    console.log("💰 Min profit threshold: " + (parseFloat(difference) * 100).toFixed(2) + "%");
    console.log("🏆 Polygon MEV Relay: " + (polygonMevRelay.isConnected() ? "Connected" : "Disconnected"));
    console.log("📡 Private transactions: bloXroute (front-running protection)\n");

}  

const checkPrice = async (exchange, token0, token1) => {  
    isExecuting = true  

    console.log(`Swap Initiated on ${exchange}, Checking Price...\n`)  

    const currentBlock = await web3.eth.getBlockNumber()  

    const priceMode = parseInt(process.env.PRICE_MODE);  

    var uPrice = await calculatePrice(uPair)  
    var sPrice = await calculatePrice(sPair)  

    switch (priceMode) {  
        case 0:  
            console.log("---------\nPRICE_MODE=0\n---------")  
            uPrice = await calculatePrice(uPair)  
            sPrice = await calculatePrice(sPair)  
            break;  
        case 1:  
            console.log("---------\nPRICE_MODE=1\n---------")  
            uPrice = await calculatePriceSixAndEighteen(uPair)  
            sPrice = await calculatePriceSixAndEighteen(sPair)  
            break;  
        case 2:  
            console.log("---------\nPRICE_MODE=2\n---------")  
            uPrice = await calculatePriceNineAndEighteen(uPair)  
            sPrice = await calculatePriceNineAndEighteen(sPair)  
            break;  
        case 3:  
            console.log("---------\nPRICE_MODE=3\n---------")  
            uPrice = await calculatePriceSixAndNine(uPair)  
            sPrice = await calculatePriceSixAndNine(sPair)  
            break;  
    }  


    const uFPrice = Number(uPrice).toFixed(units)  
    const sFPrice = Number(sPrice).toFixed(units)  
    const priceDifference = (((uFPrice - sFPrice) / sFPrice) * 100).toFixed(2)  

    console.log(`Current Block: ${currentBlock}`)  
    console.log(`-----------------------------------------`)  
    console.log(`QUICKSWAP | ${token1.symbol}/${token0.symbol}\t | ${uFPrice}`)  
    console.log(`SUSHISWAP | ${token1.symbol}/${token0.symbol}\t | ${sFPrice}\n`)  
    console.log(`Percentage Difference: ${priceDifference}%\n`)  

    if (isNaN(priceDifference)) {  
        console.log("It is recommended that you pick a new token pair until a solution is discovered!")  
        return 0;  
    }  

    return priceDifference  
}  

const determineDirection = async (priceDifference) => {  
    console.log(`Determining Direction...\n`)  

    if (priceDifference >= difference) {  

        console.log(`Potential Arbitrage Direction:\n`)  
        console.log(`Buy\t -->\t Quickswap`)  
        console.log(`Sell\t -->\t Sushiswap\n`)  
        return [qRouter, sRouter]  

    } else if (priceDifference <= -(difference)) {  

        console.log(`Potential Arbitrage Direction:\n`)  
        console.log(`Buy\t -->\t Sushiswap`)  
        console.log(`Sell\t -->\t Quickswap\n`)  
        return [sRouter, qRouter]  

    } else {  
        return null  
    }  
}  

const determineProfitability = async (_routerPath, _token0Contract, _token0, _token1) => {
    console.log(`Determining Profitability...\n`);

    let reserves, exchangeToBuy, exchangeToSell;

    if (_routerPath[0]._address == qRouter._address) {
        reserves = await getReserves(sPair);
        exchangeToBuy = 'Quickswap';
        exchangeToSell = 'Sushiswap';
    } else {
        reserves = await getReserves(uPair);
        exchangeToBuy = 'Sushiswap';
        exchangeToSell = 'Quickswap';
    }

    console.log(`Reserves on ${_routerPath[1]._address}`);
    console.log(`TOKEN_2: ${Number(web3.utils.fromWei(reserves[0].toString(), 'ether')).toFixed(0)}`);
    console.log(`TOKEN_1: ${web3.utils.fromWei(reserves[1].toString(), 'ether')}\n`);

    try {
        // Convert 5M USDC to raw value (6 decimals)
        const flashLoanAmount = web3.utils.toWei(process.env.MIN_FLASHLOAN_AMOUNT, 'mwei'); // USDC = 6 decimals

        // Simulate buying TOKEN_2 with TOKEN_1
        let result = await _routerPath[0].methods.getAmountsIn(flashLoanAmount, [_token0.address, _token1.address]).call();
        const token0In = result[0]; // amount of TOKEN_1 needed
        const token1In = result[1];

        // Simulate selling TOKEN_2 back to TOKEN_1
        result = await _routerPath[1].methods.getAmountsOut(token1In, [_token1.address, _token0.address]).call();
        const token0Out = result[1]; // amount of TOKEN_1 returned

        console.log(`Estimated TOKEN_1 needed to buy TOKEN_2 on ${exchangeToBuy}:\t| ${token0In}`);
        console.log(`Estimated TOKEN_1 returned after selling on ${exchangeToSell}:\t| ${token0Out}\n`);

        let amountInEth = web3.utils.fromWei(token0In, 'ether');
        let amountOutEth = web3.utils.fromWei(token0Out, 'ether');

        // Calculate profit in TOKEN_1 (proper decimal handling)
        const profit = amountOutEth - amountInEth;
        
        // Get dynamic gas pricing for accurate cost estimation
        const gasPrices = await gasOptimizer.getCurrentGasPrices();
        gasOptimizer.logGasInfo(gasPrices, 'fastest');
        
        // Determine direction for gas estimation
        const tempStartOnQuickswap = (_routerPath[0]._address == qRouter._address);
        
        // Estimate actual gas cost for the arbitrage transaction
        const tempTx = {
            from: account,
            to: arbitrage._address,
            data: arbitrage.methods.executeTrade(tempStartOnQuickswap, _token0.address, _token1.address, token0In).encodeABI()
        };
        const estimatedGasUnits = await gasOptimizer.estimateGasWithBuffer(tempTx);
        const gasPrice = await gasOptimizer.getOptimalGasPrice('fastest');
        
        // Convert gas cost to TOKEN_1 units by getting MATIC->TOKEN_1 exchange rate
        const totalGasCostWei = BigInt(gasPrice) * BigInt(estimatedGasUnits);
        const gasCostMatic = parseFloat(web3.utils.fromWei(totalGasCostWei.toString(), 'ether'));
        
        // Get MATIC price in TOKEN_1 terms using router
        let gasCostInToken1 = 0;
        try {
            // Try to get accurate MATIC->TOKEN_1 conversion using router
            const maticAmount = web3.utils.toWei(gasCostMatic.toString(), 'ether');
            const path = ['0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270', _token0.address]; // WMATIC -> TOKEN_1
            const amounts = await _routerPath[0].methods.getAmountsOut(maticAmount, path).call();
            gasCostInToken1 = parseFloat(web3.utils.fromWei(amounts[1], 'ether'));
        } catch (error) {
            console.log('⚠️ Could not get MATIC->TOKEN_1 price, skipping gas cost in profit calc');
            gasCostInToken1 = 0; // Conservative: don't subtract unknown gas cost
        }
        
        const netProfit = profit - gasCostInToken1;

        console.log(`Estimated Profit: ${profit} TOKEN_1`);
        console.log(`Estimated Gas Cost: ${gasCostMatic} MATIC (${gasPrices.fastest} gwei) = ${gasCostInToken1} TOKEN_1`);
        console.log(`Net Profit: ${netProfit} TOKEN_1\n`);

        if (netProfit > 0) {
            amount = token0In;
            return true;
        }

        return false;
    } catch (error) {
        console.log(error);
        console.log(`\n❌ Error while determining profitability. Check token decimals or liquidity issues.\n`);
        return false;
    }
}; 
          
         


        
        

const executeTrade = async (_routerPath, _token0Contract, _token1Contract) => {  
    console.log(`Attempting Arbitrage...\n`)  

    let startOnQuickswap  

    if (_routerPath[0]._address == qRouter._address) {  
        startOnQuickswap = true  
    } else {  
        startOnQuickswap = false  
    }  

    // Fetch token balance before  
    const balanceBefore = await _token0Contract.methods.balanceOf(account).call()  
    const ethBalanceBefore = await web3.eth.getBalance(account)  

    /*  
    if (config.PROJECT_SETTINGS.isDeployed) {  
        //await _token0Contract.methods.approve(arbitrage._address, amount).send({ from: account }) // WE DONT NEED THIS BECAUSE OF THE FLASHLOAN  
        await arbitrage.methods.executeTrade(startOnQuickswap, _token0Contract._address, _token1Contract._address, amount).send({ from: account, gas: gas })  
    }  
    */  

    // 🎯 POLYGON MEV PRIVATE TRANSACTION EXECUTION
    if (config.PROJECT_SETTINGS.isDeployed) {
        console.log('🏆 Executing Polygon MEV private transaction...');
        
        if (!polygonMevRelay.isConnected()) {
            console.log('⚠️ Polygon MEV Relay not connected, falling back to public transaction');
            
            // Fallback to public transaction
            const arbitrageTransaction = {
                'from': account,
                'to': arbitrage._address,
                'data': arbitrage.methods.executeTrade(startOnQuickswap, _token0Contract._address, _token1Contract._address, amount).encodeABI()
            };
            
            const optimizedTx = await gasOptimizer.createOptimizedTransaction(arbitrageTransaction, 'fastest');
            const signedTx = await web3.eth.accounts.signTransaction(optimizedTx, process.env.DEPLOYMENT_ACCOUNT_KEY);
            const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
            console.log(`✅ Public arbitrage tx: ${receipt.transactionHash}`);
            
            return receipt;
        }

        try {
            // Create private arbitrage transaction 
            const privateTx = await polygonMevRelay.createPrivateArbitrageTx(
                _routerPath, 
                _token0Contract, 
                _token1Contract, 
                amount, 
                account
            );
            
            // Submit to bloXroute private mempool
            const submission = await polygonMevRelay.submitPrivateTransaction(privateTx.signedTransaction);
            
            if (submission.success) {
                console.log(`🎯 Private arbitrage transaction submitted successfully!`);
                console.log(`📦 Transaction hash: ${submission.txHash}`);
                console.log(`🏆 Front-running protection: ACTIVE`);
                console.log(`⚡ Private mempool routing: 400-1000ms faster`);
                
                return {
                    transactionHash: submission.txHash,
                    type: 'private_transaction',
                    protection: 'front_running_protected'
                };
            } else {
                throw new Error('Private transaction submission failed: ' + submission.error);
            }
            
        } catch (error) {
            console.error('❌ Private transaction execution failed:', error.message);
            console.log('🔄 Falling back to public transaction...');
            
            // Fallback to public transaction
            const arbitrageTransaction = {
                'from': account,
                'to': arbitrage._address,
                'data': arbitrage.methods.executeTrade(startOnQuickswap, _token0Contract._address, _token1Contract._address, amount).encodeABI()
            };
            
            const optimizedTx = await gasOptimizer.createOptimizedTransaction(arbitrageTransaction, 'fastest');
            const signedTx = await web3.eth.accounts.signTransaction(optimizedTx, process.env.DEPLOYMENT_ACCOUNT_KEY);
            const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
            console.log(`✅ Fallback public tx: ${receipt.transactionHash}`);
            
            return receipt;
        }
    }  



    console.log(`Trade Complete:\n`)  

    // Fetch token balance after  
    const balanceAfter = await _token0Contract.methods.balanceOf(account).call()  
    const ethBalanceAfter = await web3.eth.getBalance(account)  

    const balanceDifference = balanceAfter - balanceBefore  
    const totalSpent = ethBalanceBefore - ethBalanceAfter  

    const data = {  
        'ETH Balance Before': web3.utils.fromWei(ethBalanceBefore, 'ether'),  
        'ETH Balance After': web3.utils.fromWei(ethBalanceAfter, 'ether'),  
        'ETH Spent (gas)': web3.utils.fromWei((ethBalanceBefore - ethBalanceAfter).toString(), 'ether'),  
        '-': {},  
        'TOKEN_1 Balance BEFORE': web3.utils.fromWei(balanceBefore.toString(), 'ether'),  
        'TOKEN_1 Balance AFTER': web3.utils.fromWei(balanceAfter.toString(), 'ether'),  
        'TOKEN_1 Gained/Lost': web3.utils.fromWei(balanceDifference.toString(), 'ether'),  
        '-': {},  
        'Total Gained/Lost': `${web3.utils.fromWei((balanceDifference - totalSpent).toString(), 'ether')} ETH`  
    }  

    console.table(data)  
}  

main()

}

