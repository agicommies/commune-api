const { ApiPromise, WsProvider } = require('@polkadot/api');
const fs = require('fs');
const path = require('path');

// File to store extrinsics
// Alternatively, you can use a database
const filePath = path.join(__dirname, 'extrinsics.json');


async function processBlock(api, blockNumber) {
  try {
    const hash = await api.rpc.chain.getBlockHash(blockNumber);
    const block = await api.rpc.chain.getBlock(hash);
    const events = await api.query.system.events.at(hash);

    // Filter and map extrinsics to include relevant events directly within each extrinsic
    let mergedExtrinsics = block.block.extrinsics.map((extrinsic, index) => {
      const relevantEvents = events.filter(event => {
        const { phase } = event;
        return phase.isApplyExtrinsic && phase.asApplyExtrinsic.eq(index);
      }).map(event => event.toHuman());

      const txHash = extrinsic.hash.toHex();

      return {
        blockNumber,
        index,
        txHash,
        extrinsic: {
          ...extrinsic.toHuman(),  
          events: relevantEvents 
        }
      };
    }).filter(extrinsic => extrinsic.extrinsic.events.length > 0); 

    const dataToWrite = {
      blockNumber,
      blockHash: hash.toHex(),
      extrinsics: mergedExtrinsics 
    };

    // Ensure valid JSON structure when appending
    if (fs.existsSync(filePath)) {
      // Read existing data, parse it, append new data, and write back
      let existingData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (!Array.isArray(existingData)) existingData = []; // Ensure existing data is an array
      existingData.push(dataToWrite); // Append new block data
      fs.writeFileSync(filePath, JSON.stringify(existingData, null, 2)); // Write updated array back to file
    } else {
      // File doesn't exist, write the first element as an array
      fs.writeFileSync(filePath, JSON.stringify([dataToWrite], null, 2));
    }
  } catch (error) {
    console.error(`Error fetching block ${blockNumber}:`, error);
  }
}

async function main() {
  // If looking to use a custom endpoint please specify the `--prunning` flag to be `archive`
  // or other endpoint, that supports historical data
  const wsProvider = new WsProvider('wss://commune.api.onfinality.io/public-ws'); 
  const api = await ApiPromise.create({ provider: wsProvider });

  // Get the latest block number
  const lastHeader = await api.rpc.chain.getHeader();
  const lastBlockNumber = lastHeader.number.toNumber();

  const genesisBlock = 22576;
  for (let i = genesisBlock; i <= lastBlockNumber; i++) {
    await processBlock(api, i);
  }

  // Subscribe to new blocks for constant updates
  await api.rpc.chain.subscribeNewHeads(async (header) => {
    await processBlock(api, header.number.toNumber());
  });
}

main().catch(console.error);