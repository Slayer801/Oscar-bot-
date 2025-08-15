// helpers/initialization.js

require("dotenv").config(); const Web3 = require("web3");

// ✅ Set up Web3 connection const web3 = new Web3(process.env.RPC_URL || "https://polygon-rpc.com");

// ✅ DEX Addresses const UNISWAP_FACTORY_ADDRESS = "0x1F98431c8aD98523631AE4a59f267346ea31F984"; const UNISWAP_ROUTER_ADDRESS = "0xE592427A0AEce92De3Edee1F18E0157C05861564";

const SUSHISWAP_FACTORY_ADDRESS = "0xc35DADB65012eC5796536bD9864eD8773aBc74C4"; const SUSHISWAP_ROUTER_ADDRESS = "0x1b02da8cb0d097eb8d57a175b88c7d8b47997506";

const QUICKSWAP_FACTORY_ADDRESS = "0x5757371414417b8c6caad45baef941abc7d3ab32"; const QUICKSWAP_ROUTER_ADDRESS = "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff";

// ✅ ABIs (minimal factory/router interfaces) const factoryABI = [ { constant: true, inputs: [ { name: "tokenA", type: "address" }, { name: "tokenB", type: "address" }, ], name: "getPair", outputs: [{ name: "pair", type: "address" }], type: "function", }, ];

const routerABI = [ { name: "getAmountsOut", type: "function", inputs: [ { name: "amountIn", type: "uint256" }, { name: "path", type: "address[]" }, ], outputs: [ { name: "amounts", type: "uint256[]" }, ], constant: true, }, { name: "getAmountsIn", type: "function", inputs: [ { name: "amountOut", type: "uint256" }, { name: "path", type: "address[]" }, ], outputs: [ { name: "amounts", type: "uint256[]" }, ], constant: true, }, ];

// ✅ Create contract instances const uFactory = new web3.eth.Contract(factoryABI, UNISWAP_FACTORY_ADDRESS); const uRouter = new web3.eth.Contract(routerABI, UNISWAP_ROUTER_ADDRESS);

const sFactory = new web3.eth.Contract(factoryABI, SUSHISWAP_FACTORY_ADDRESS); const sRouter = new web3.eth.Contract(routerABI, SUSHISWAP_ROUTER_ADDRESS);

const qFactory = new web3.eth.Contract(factoryABI, QUICKSWAP_FACTORY_ADDRESS); const qRouter = new web3.eth.Contract(routerABI, QUICKSWAP_ROUTER_ADDRESS);

const arbitrageABI = require("../abis/Arbitrage.json");
const arbitrageAddress = process.env.ARBITRAGE_CONTRACT_ADDRESS;

let arbitrage = null;

if (arbitrageAddress && arbitrageAddress !== "") {
  arbitrage = new web3.eth.Contract(arbitrageABI, arbitrageAddress);
  console.log("Arbitrage contract loaded at:", arbitrageAddress);
} else {
  console.warn("ARBITRAGE_CONTRACT_ADDRESS is missing. Arbitrage contract not loaded.");
}

