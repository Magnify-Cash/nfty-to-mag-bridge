import * as fs from "fs";

interface Addresses {
  [key: string]: {
    old?: Record<string, string>;
    new?: Record<string, string>;
  };
}

import hre from "hardhat";
const { ethers } = hre;

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function verify(address: string, args: any) {
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost")
  {
    let retry = 20;
    console.log("Sleeping before verification...");
    while ((await ethers.provider.getCode(address).catch(() => "")).length <= 3 && retry >= 0)
    {
      await sleep(5000);
      --retry;
    }
    await sleep(30000);

    console.log(address, args);

    await hre.run("verify:verify",
    {
      address,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      constructorArguments: args
    }
    ).catch(() => console.log("Verification failed"));
  }
}

function getAddressSaver(path: string, network: string, isLog: boolean) {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-var-requires
  const addresses: Addresses = require(path);
  if (!addresses[network]) {
    addresses[network] = {};
  }
  if (!addresses[network].old) {
    addresses[network].old = {};
  }
  if (!addresses[network].new) {
    addresses[network].new = {};
  }
  function saveAddress(
    contractName: string,
    address: string,
    isNewMigration: boolean,
  ) {
    if (isNewMigration) {
      addresses[network].old = addresses[network].new;
      addresses[network].new = {};
    }
    addresses[network].new![contractName] = address;
    if (isLog) console.log(`${contractName} deployed to ${address}`);
    fs.writeFileSync(path, JSON.stringify(addresses, null, 4));
    return addresses[network].new;
  }
  return saveAddress;
}

export { getAddressSaver, verify};
