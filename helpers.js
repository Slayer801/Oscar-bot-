const Web3 = require('web3');
const web3 = new Web3(process.env.RPC_URL || 'https://polygon-rpc.com'); // 

const getTokenAndContract = async (tokenAAddress, tokenBAddress) => { const erc20Abi = [ // Minimal ABI for ERC-20 token { "constant": true, "inputs": [], "name": "symbol", "outputs": [{ "name": "", "type": "string" }], "type": "function" }, { "constant": true, "inputs": [], "name": "decimals", "outputs": [{ "name": "", "type": "uint8" }], "type": "function" }, { "constant": true, "inputs": [{ "name": "_owner", "type": "address" }], "name": "balanceOf", "outputs": [{ "name": "balance", "type": "uint256" }], "type": "function" } ];

const token0Contract = new web3.eth.Contract(erc20Abi, tokenAAddress);
const token1Contract = new web3.eth.Contract(erc20Abi, tokenBAddress);

const token0 = {
    address: tokenAAddress,
    symbol: await token0Contract.methods.symbol().call(),
    decimals: await token0Contract.methods.decimals().call()
};

const token1 = {
    address: tokenBAddress,
    symbol: await token1Contract.methods.symbol().call(),
    decimals: await token1Contract.methods.decimals().call()
};

return { token0Contract, token1Contract, token0, token1 };

};

const getPairContract = async (factory, token0, token1) => { const pairAddress = await factory.methods.getPair(token0, token1).call(); const pairAbi = [ { "constant": true, "inputs": [], "name": "getReserves", "outputs": [ { "name": "_reserve0", "type": "uint112" }, { "name": "_reserve1", "type": "uint112" }, { "name": "_blockTimestampLast", "type": "uint32" } ], "type": "function" }, { "anonymous": false, "inputs": [], "name": "Swap", "type": "event" } ]; return new web3.eth.Contract(pairAbi, pairAddress); };

const calculatePrice = async (pairContract) => { const reserves = await pairContract.methods.getReserves().call(); return Big(reserves._reserve0).div(Big(reserves._reserve1)).toNumber(); };

const calculatePriceSixAndEighteen = async (pairContract) => { const reserves = await pairContract.methods.getReserves().call(); const price = Big(reserves._reserve0).times(10 ** 18).div(Big(reserves._reserve1).times(10 ** 6)); return price.toNumber(); };

const calculatePriceNineAndEighteen = async (pairContract) => { const reserves = await pairContract.methods.getReserves().call(); const price = Big(reserves._reserve0).times(10 ** 18).div(Big(reserves._reserve1).times(10 ** 9)); return price.toNumber(); };

const calculatePriceSixAndNine = async (pairContract) => { const reserves = await pairContract.methods.getReserves().call(); const price = Big(reserves._reserve0).times(10 ** 9).div(Big(reserves._reserve1).times(10 ** 6)); return price.toNumber(); };

const getEstimatedReturn = async (amountIn, routerPath, token0, token1) => { const amounts = await routerPath[0].methods.getAmountsOut(amountIn, [token0.address, token1.address]).call(); const reverse = await routerPath[1].methods.getAmountsOut(amounts[1], [token1.address, token0.address]).call(); return { amountIn: web3.utils.fromWei(amounts[0]), amountOut: web3.utils.fromWei(reverse[1]) }; };

const getReserves = async (pairContract) => { return await pairContract.methods.getReserves().call(); };

module.exports = { getTokenAndContract, getPairContract, calculatePrice, calculatePriceSixAndEighteen, calculatePriceNineAndEighteen, calculatePriceSixAndNine, getEstimatedReturn, getReserves };

