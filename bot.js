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
const { uFactory, uRouter, sFactory, sRouter, qFactory, qRouter, web3, arbitrage } = require('./helpers/initialization')  

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

const main = async () => {  
    const { token0Contract, token1Contract, token0, token1 } = await getTokenAndContract(arbFor, arbAgainst)  
    uPair = await getPairContract(qFactory, token0.address, token1.address)  
    sPair = await getPairContract(sFactory, token0.address, token1.address)  


    uPair.events.Swap({}, async () => {  
        if (!isExecuting) {  
            isExecuting = true  

            const priceDifference = await checkPrice('Quickswap', token0, token1)  
            const routerPath = await determineDirection(priceDifference)  

            if (!routerPath) {  
                console.log(`No Arbitrage Currently Available\n`)  
                console.log(`-----------------------------------------\n`)  
                isExecuting = false  
                return  
            }  

            const isProfitable = await determineProfitability(routerPath, token0Contract, token0, token1)  

            if (!isProfitable) {  
                console.log(`No Arbitrage Currently Available\n`)  
                console.log(`-----------------------------------------\n`)  
                isExecuting = false  
                return  
            }  

            const receipt = await executeTrade(routerPath, token0Contract, token1Contract)  

            isExecuting = false  
        }  
    })  

    sPair.events.Swap({}, async () => {  
        if (!isExecuting) {  
            isExecuting = true  

            const priceDifference = await checkPrice('Sushiswap', token0, token1)  
            const routerPath = await determineDirection(priceDifference)  

            if (!routerPath) {  
                console.log(`No Arbitrage Currently Available\n`)  
                console.log(`-----------------------------------------\n`)  
                isExecuting = false  
                return  
            }  

            const isProfitable = await determineProfitability(routerPath, token0Contract, token0, token1)  

            if (!isProfitable) {  
                console.log(`No Arbitrage Currently Available\n`)  
                console.log(`-----------------------------------------\n`)  
                isExecuting = false  
                return  
            }  

            const receipt = await executeTrade(routerPath, token0Contract, token1Contract)  

            isExecuting = false  
        }  
    })  

    console.log("Waiting for swap event...")  

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

        const profit = amountOutEth - amountInEth;
        const totalGasCost = parseFloat(process.env.GAS_PRICE);
        const netProfit = profit - totalGasCost;

        console.log(`Estimated Profit: ${profit} TOKEN_1`);
        console.log(`Estimated Gas Cost: ${totalGasCost} ETH`);
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

    // data: ABI byte string containing the data of the function call on a contract  
    if (config.PROJECT_SETTINGS.isDeployed) {  
        const approvalTransaction = {  
            'from' : account,  
            'to' : _token0Contract._address,  
            'data' : _token0Contract.methods.approve(arbitrage._address, amount).encodeABI()  
        }  
        const transaction = {  
            'from' : account,  
            'to' : _token0Contract._address,  
            'data' : arbitrage.methods.executeTrade(startOnQuickswap, _token0Contract._address, _token1Contract._address, amount).encodeABI(),  
            'gas' : gas  
              
        }  
        const signedApprovalTx = await web3.eth.accounts.signTransaction(approvalTransaction, process.env.DEPLOYMENT_ACCOUNT_KEY)  
        const signedTx = await web3.eth.accounts.signTransaction(transaction, process.env.DEPLOYMENT_ACCOUNT_KEY)  
        //await arbitrage.methods.executeTrade(startOnQuickswap, _token0Contract._address, _token1Contract._address, amount).send({ from: account, gas: gas })  
        await web3.eth.sendSignedTransaction(signedApprovalTx.rawTransaction)  
        await web3.eth.sendSignedTransaction(signedTx.rawTransaction)  
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

