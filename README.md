# Magnify Cash | MAG Token & Bridges

## Installation

Prerequisites: `NodeJS` version 16 or higher, `npm` version 7 or higher.

📝 _`NodeJS` version **`v20.9.0`** (LTS) and `npm` version **`10.1.0`** were used for development_.

Run the command `$ npm install` in [the root of the project directory](./) to install all the dependencies specified in [`package.json`](./package.json), compile contracts ([`contracts/`](./contracts/)), prepare an ABI ([`abi/`](./abi/)), documentation ([`docs/`](./docs/)) for the contracts in [the NatSpec format](https://docs.soliditylang.org/en/latest/natspec-format.html) and [Husky hooks](#husky-hooks).

## Testing

Run `$ npm run dev:coverage` to examine how well the developed tests cover the functionality of contracts. The results can also be viewed in a web browser by opening a file [`coverage/index.html`](./coverage/index.html) created by the script.

Perform tests with `$ npm test` to run all tests from the [`test/`](./test/) directory.

Use `$ npm run test-t` to see events and calls when running tests, or `$ npm run test-ft` to also see the storage operations.

📝 _Each test case (`it()`) of [`tests/`](./test/) is independent due to isolation using [a fixture](https://hardhat.org/hardhat-network-helpers/docs/reference#fixtures), [a snapshot](https://hardhat.org/hardhat-network-helpers/docs/reference#snapshots) or `beforeEach()`, so the entire specific flow is contained in `it()` and a set of `before()` and `beforeEach()` before it._

### Test coverage results

| File           | % Stmts | % Branch | % Funcs | % Lines |
| -------------- | ------- | -------- | ------- | ------- |
| MAGToken.sol   | 100     | 100      | 100     | 100     |
| MAGBridge.sol  | 100     | 100      | 100     | 100     |
| NFTYBridge.sol | 100     | 98.75    | 100     | 100     |

## Utilities

-   `$ npm run dev:docs` to generate a documentation for contracts. _The documentation is generated for all contracts in the directory [`contracts/`](./contracts/) to the directory [`docs/`](./docs/) using [the NatSpec format](https://docs.soliditylang.org/en/latest/natspec-format.html). It uses the OpenZeppelin's documentation generation library [solidity-docgen](https://github.com/OpenZeppelin/solidity-docgen)._

## Troubleshooting

Use `$ npm run clean` and try again.

## Environment setup

Before running scripts for deployment or making snapshots it is important to set up all keys. In file [`.env.example`](./.env.example) there are all variables that must be copy and set in file [`.env`].

### Short description:

-   SEPOLIA_URL, AMOY_URL, BNB_TESTNET_URL, BASE_TESTNET_URL: These are URLs for different test networks. They are currently commented out, but can be uncommented and set to the appropriate URLs for testing purposes.
-   MAINNET_URL, POLYGON_MAINNET_URL, BNB_MAINNET_URL, BASE_MAINNET_URL: These are URLs for different mainnet networks. They are currently commented out, but can be uncommented and set to the appropriate URLs for interacting with live networks.
-   PRIVATE_KEY: This is the private key for the sender account. It is currently set to an empty string, but should be replaced with a valid private key. All deployments and scripts that can be running, will be done from this private key.
-   ETHERSCAN_API_KEY, POLYGONSCAN_API_KEY, BNBSCAN_API_KEY, BASE_API_KEY: These are API keys for different block explorers. They are currently commented out, but can be uncommented and set to the appropriate keys for interacting with the respective block explorers. Required for verification smart contracts.
-   MORALIS_API_KEY: This is the API key for the Moralis service. It is currently set to a placeholder value, but should be replaced with a valid API key. Required for making snapshots of the tokens of chains.

## NFTY Bridge

### Overview

The NFTYBridge contract serves as a bridge between two chains, allowing the transfer of tokens between them. It includes functionalities for initializing the contract, transferring tokens between chains, and managing whitelisted addresses.

-   `initialize(uint24 \_secondChainId, address \_relayer, uint256 \_minTimeToWaitBeforeRefund, string calldata \_chain) public initializer`
    Description: Initializes the contract with the provided parameters.
    Parameters:
    \_secondChainId: Chain ID of the second chain.
    \_relayer: Address of the relayer.
    \_minTimeToWaitBeforeRefund: Minimum time to wait before refunding a transaction.
    \_chain: Name of the chain.

-   `allWhitelistedTokensLength() external view returns (uint256)`
    Description: Returns the length of all whitelisted tokens.

-   `getAllWhitelistedTokens() external view returns (address[] memory)`
    Description: Returns an array of all whitelisted tokens.

-   `\_getChainNonce() internal view returns (string memory)`
    Description: Concatenates the chain name with the nonce and returns the result as a string.

Modifiers:

-   `onlySupportedToken(address token)`
    Description: Ensures that the token is supported before executing a function.
    Reverts: If the token is not supported.

-   `onlyWhitelisted(address caller, uint256 amount)`
    Description: Checks if the caller is whitelisted and has sufficient allocation before executing a function.
    Reverts: If the caller is not whitelisted or does not have enough allocation.

External Functions:

### Send

The `send` function is used to send tokens from one chain to another through the bridge contract. It initiates the transfer of tokens and locks them in the contract until the transfer is completed.

function `send(address token, address to, uint256 amount) external`

Description: Sends tokens from one chain to another through the bridge contract.

Parameters:

-   token: Address of the token to be transferred.
-   to: Address to which the tokens should be sent on the other chain.
-   amount: Amount of tokens to be transferred.

Requirements

-   The token must be supported by the bridge contract.
-   The sender must have approved the contract to transfer the specified amount of tokens.
-   The sender must have sufficient balance of the token to transfer.
-   The contract must have enough tokens to transfer.

Modifiers

-   onlySupportedToken(address token): Ensures that the token is supported by the bridge contract.
-   onlyWhitelisted(address caller, uint256 amount): Checks if the caller is whitelisted and has sufficient allocation.

Effects

-   Locks the specified amount of tokens in the contract.
-   Emits a Sent event to indicate the initiation of the transfer.

Events

-   Sent(address indexed token, address indexed sender, address indexed to, uint256 amount, uint256 nonce): Indicates the initiation of a transfer.

### Refund

The `refund` function is used to refund tokens from the bridge contract. It allows the creator of a transfer or the relayer to refund the tokens in case the transfer is not completed.

function `refund(uint256 nonceToRefund) external`
Description: Refunds tokens from the bridge contract.

Parameters:

-   nonceToRefund: Nonce of the transfer to refund.

Requirements

-   The transfer with the specified nonce must exist.
-   The transfer must not have been refunded before.
-   The transfer must have been initiated at least minTimeToWaitBeforeRefund seconds ago.
-   The caller must be the creator of the transfer or the relayer.

Modifiers

-   onlyWhitelisted(address caller, uint256 amount): Ensures that the caller is whitelisted and has sufficient allocation.

Effects

-   Marks the transfer as refunded.
-   Transfers the tokens back to the creator.
-   Emits a Refund event.

### Block refund

The `blockRefund` function is used to block the refund of tokens from the bridge contract. It allows the admin to prevent the refund of tokens in case the transfer is completed.

Function `blockRefund(uint256 nonceToRefund, uint256 blockNumber) external`

Description: Blocks the refund of tokens from the bridge contract.

Parameters

-   nonceToRefund: Nonce of the transfer to block refund.
-   blockNumber: Block number at which the transfer is completed.

Requirements

-   The transfer with the specified nonce must exist.
-   The transfer must not have been blocked before.
-   The transfer must have been completed at the specified block number.

Modifiers

-   Ensures that the caller is the relayer.

Effects

-   Marks the transfer as blocked.
-   Emits a BlockRefund event.

### Emergency Withdraw

The `emergencyWithdraw` function is used to withdraw tokens from the bridge contract in case of an emergency. It allows the admin to withdraw tokens that are locked in the contract due to an uncompleted transfer.

function `emergencyWithdraw(address token) external`

Description: Withdraws tokens from the bridge contract in case of an emergency.

Parameters

-   token: Address of the token to be withdrawn. (address zero allows to withdraw native token from the contract)

Requirements

-   The token must be supported by the bridge contract.
-   The caller must be the admin.
-   There must be tokens locked in the contract for the specified token.

Modifiers

-   Ensures that the caller is the admin.

Effects

-   Unlocks the locked tokens for the specified token.
-   Transfers the tokens back to the admin.
-   Emits an EmergencyWithdraw event.

Events

`EmergencyWithdraw(address indexed token, address indexed admin, uint256 amount)`: Indicates the emergency withdrawal of tokens.

### Initialization:

The contract initializes the following roles and parameters during deployment:

-   Default admin role is set to the deployer.
-   Relayer role is set to the provided relayer address.
-   Second chain ID is set to the provided value.
-   Minimum time to wait before refunding a transaction is set.

### Administrative

Functions `addToken` and `removeToken` are responsible for adding and removing supporting tokens.

Function `setMinAmountForToken` is responsible for setting minimum amount of tokens to transfer.

Function `setOtherChainToken` is responsible for setting address of the token to be sent on the other chain.

Function `setTimeForWaitBeforeRefund` is responsible for setting minimum amount for waiting in case when transfer on the other chain is not complete and user want to make refund, to take his tokens back. Notice: time must be set in seconds!

Functions `setWhitelisted` and `setAllocations` are responsible for allowing only specific users to call `send` function. It is also allow transfer only specific amount of tokens based on snapshot of the token.

### Pause controller

NFTY Bridge contract allows set pause on `send` function or allow to call `emergencyWithdraw` function.

## MAG Bridge

The MAG Bridge is the second part of the bridge and was developed for receiving tokens on BASE network. The main difference between NFTY and MAG bridge is that `send`, `refund` and `blockRefund` functions are not exist. For receiving tokens there is a function `withdraw` and available only for relayer.

### Withdraw

The `withdraw` function is used to send tokens to receiver from event on NFTY bridge contract. It initiates the transfer of tokens from relayer address.

function `withdraw(address token, address to, uint256 amount, string calldata nonceOnOtherChain) external whenNotPaused onlyRole(RELAYER_ROLE) onlySupportedToken(token)`

Description: Sends tokens from the contract to receiver.

Parameters:

-   token: Address of the token to be transferred.
-   to: Address to which the tokens should be sent on the other chain.
-   amount: Amount of tokens to be transferred.
-   nonceOnOtherChain: Nonce that was generated on NFTY bridge to track all sends

Requirements

-   The token must be supported by the bridge contract.
-   The sender must be relayer
-   Contract must be on unpause state
-   The contract must have enough tokens to transfer.

Modifiers

-   onlySupportedToken(address token): Ensures that the token is supported by the bridge contract.
-   only for relayers

Events

-   `Withdraw(token, otherChainToken[token], to, amount, nonceOnOtherChain)`: Indicates the success of transferring tokens to receiver.

### Rest of the functions

Rest of the function are the same as in NFTY bridge contract. It also has function for manage tokens (add and remove) and withdrawing tokens from the contract (emergency withdraw), except functions for managing whitelisted users. Support pause and unpause.

## MAG Token

Here's the refined documentation for the `MAGToken` contract, combining clarity, technical details, and user-friendliness:

**MAGToken Contract Documentation**

**Overview**

-   **Token Name:** MAG Token (MAG)
-   **Standard:** ERC20 (with extensions)
-   **Key Features:**
    -   Pausable: Token transfers can be temporarily halted by authorized administrators.
    -   Role-Based Access: Uses OpenZeppelin's AccessControl for managing permissions.
    -   Permit: Allows for gas-efficient token approvals through off-chain signatures.
    -   Bridge Integration: Special privileges for a designated bridge contract during paused states.

**Contract Details**

-   **Deployment:**

    -   Initial total supply (`_totalSupply`) is minted to the deployer's address.
    -   The deployer is assigned the `DEFAULT_ADMIN_ROLE` and `PAUSER_ROLE`.
    -   A bridge address (`_bridge`) must be provided during deployment and is assigned the `BRIDGE_ROLE`.

-   **Roles:**

    -   `PAUSER_ROLE`: Authorized to pause and unpause token transfers.
    -   `BRIDGE_ROLE`: Allowed to transfer tokens even when the contract is paused.
    -   `DEFAULT_ADMIN_ROLE`: Has full administrative privileges over the contract (implicitly includes `PAUSER_ROLE`).

-   **Functions:**

    -   **`pause()`:** Pauses all token transfers (except for the bridge). Requires `PAUSER_ROLE`.
    -   **`unpause()`:** Resumes token transfers. Requires `PAUSER_ROLE`.
    -   **`_beforeTokenTransfer()` (internal):**
        -   Overridden to implement the bridge exception during paused states.
        -   If paused, only the bridge or contract owner can transfer tokens.

**Errors:**

-   **`ZeroAddress()`:** Thrown if the bridge address provided during deployment is invalid (zero address).
-   **`OnlyBridgeCanTransfer()`:** Thrown if a non-bridge or non-admin account attempts to transfer tokens while the contract is paused.

**Usage Notes**

-   **Security:** The contract is not upgradable. Carefully audit and test before deployment.
-   **Pause Functionality:** Use the pause/unpause features cautiously in case of emergencies or vulnerabilities.
-   **Bridge Integration:** The bridge integration allows for cross-chain transfers even when the token is paused, which might be useful for certain scenarios but should be considered carefully from a security perspective.

## Snapshots creation

**Token Holder Data Retrieval Script**

**Overview**

This script utilizes the Moralis API to fetch token holder data from the Binance Smart Chain (BSC), Ethereum Mainnet (ETH) and Polygon for a specific ERC20 token. It then filters the data and saves it to a JSON file.

**Prerequisites**

-   **Moralis API Key:** Obtain an API key from Moralis and store it in a `.env` file at the root of your project as `MORALIS_API_KEY`.

**Configuration**

-   **Token Address (Line 10)**: Already set corresponding to the file name and chain to run the script.
-   **Pages (Line 25)**: Change the value of `pages` to adjust the number of holder pages to fetch. Each page fetches a maximum of 100 holders (12,600 holders in this case). This is crucial part, making mistake may cause problems in future calculation amount for sending to bridge and total supply of the token, users will not get more tokens that they should, but it is better to make this step correctly. In order to see go to the explorer of the chain and search for the amount of token holders.

**Execution**

Each network must be run separately

1. Ethereum mainnet

```bash
npx hardhat run ./scripts/snapshots/snapshotEthereum.ts
```

2. Binance smart chain

```bash
npx hardhat run ./scripts/snapshots/snapshotBsc.ts
```

3. Polygon

```bash
npx hardhat run ./scripts/snapshots/snapshotPolygon.ts
```

**Output**

The script will create a file named `tokenHoldersBsc.json`, `tokenHoldersEthereum.json` and `tokenHoldersPolygon.json` in the same directory. This file will contain a JSON array with the following structure for each holder:

```json
[
    {
        "walletAddress": "0x...",
        "balance": "..."
    },
    {
        "walletAddress": "0x...",
        "balance": "..."
    }
]
```

-   `walletAddress`: The Ethereum address of the token holder.
-   `balance`: The holder's balance of the specified token.

**Explanation**

1. **Import and Setup:** Imports required libraries and initializes Moralis with the API key.
2. **Data Fetching:**
    - Iterates through a specified number of pages.
    - Fetches token owners from Moralis's EVM API for the given token address on the BSC.
    - Uses cursors to retrieve subsequent pages.
3. **Data Filtering:**
    - Extracts wallet addresses and balances from the raw Moralis response.
    - Creates a simplified JSON array for easier use.
4. **Output:**
    - Writes the filtered data to a JSON file.

**Important Notes:**

-   **Rate Limits:** Be aware of Moralis API rate limits to avoid errors.
-   **Data Accuracy:** Data from blockchain APIs can sometimes be delayed or incomplete. Always double-check critical information.
-   **Environment Variables:** Ensure your `.env` file is properly configured with your Moralis API key.

## MAG Bridge deployment

-   FIRST TRY TO RUN SCRIPTS ON TESTNETS

**MAGBridge Contract Deployment and Verification Script**

**Purpose**

This script automates the deployment and verification process for the `MAGBridge` contract on a specified Base network.

**Prerequisites**

-   **Hardhat Development Environment:** This script is built to run within a Hardhat project setup. Ensure you have Hardhat and its dependencies installed.
-   **Basescan API Key:** The automatic verification feature, obtain an Basescan API key and set it as an environment variable named `BASE_API_KEY`.

**Configuration**

-   **`relayerAddress` (Line 8):** Update this with the Base address of the account designated as the relayer (likely responsible for cross-chain communication). It is also available to add more relayers later on by going to contract on explorer and adding relayer through write proxy method (role bytes required). So, to get role bytes you can get in read proxy method.

**Execution**

1. **Deployment:**
    - Run the script from your terminal using:
        ```bash
        npx hardhat run ./scripts/deployment/deployMAGBridge.ts --network base
        ```

**Functionality**

1. **Initialization:**

    - Gets the deployer account from Hardhat.
    - Logs relevant deployment information (deployer address, target chain ID, relayer address).

2. **Deployment:**

    - Fetches the `MAGBridge` contract factory.
    - Deploys the contract as an upgradeable proxy using the OpenZeppelin Upgrades plugin, passing the target chain ID and relayer address as constructor arguments.

3. **Address Saving:**

    - Stores the deployed contract address in a JSON file (`deploymentAddresses.json`) for future reference.

4. **Verification:**
    - If an Base API key is available, it attempts to verify the contract source code on Etherscan automatically. In case of error try to set new base api key or read the error. It also may say, that you need to change the name of the network base (example: from base -> baseMainnet).

**Output**

-   The script logs the following to the console:
    -   Deployment progress.
    -   Deployed contract address.
    -   Verification status (if applicable).
-   The deployed contract address is also saved to the `deploymentAddresses.json` file.

**Error Handling**

-   The script includes a basic `catch` block to log any errors that occur during deployment or verification.

**Key Points**

-   **Upgradeable:** This script deploys the `MAGBridge` contract as an upgradeable proxy, allowing for future upgrades if necessary.
-   **Customization:** You can easily adapt this script to deploy other contracts or modify the configuration for different networks or parameters.

## MAG Token deployment

-   FIRST TRY TO RUN SCRIPTS ON TESTNETS

**MAGToken Deployment Script (deployMAGToken.ts)**

**Purpose**

This script automates the deployment and verification of the `MAGToken` ERC20 contract on a specified Base network. It handles the calculation of a portion of the token supply for a bridge contract, deployment of the `MAGToken` contract, and verification on Basescan.

**Prerequisites**

-   **Etherscan API Key:** Obtain an Etherscan API key and set it as an environment variable named `BASE_API_KEY` to enable automatic verification.

**Configuration**

-   **`TOTAL_SUPPLY`:** Adjust this value if you want to modify the total supply of MAG tokens to be minted (default is 100,000,000 with 18 decimals). It is available to change total supply based on amount from all snapshots. So, it is recommended to make snapshots first.
-   **`testnetBridge` & `mainnetBridge`:** Update these variables with the correct bridge contract addresses for the respective networks (Base testnet and mainnet). So, if MAG bridge is not deployed yet, it must be deployed first, but if something went wrong you can grant bridge role to bridge later on base explorer.

**Execution**

1. **Preparation:**
    - Verify your Hardhat project setup and network configuration.
    - Set your `BASE_API_KEY` environment variable if you want automatic verification.
2. **Deployment:**
    - Run the script from your terminal if you want to run on mainnet:
        ```bash
        npx hardhat run ./scripts/deployment/deployMAGToken.ts --network base
        ```
    - Run the script from your terminal if you want to run on testnet (recommended to do first):
        ```bash
        npx hardhat run ./scripts/deployment/deployMAGToken.ts --network baseSepolia
        ```

**Functionality**

1. **Initialization:**
    - Gets the deployer account.
    - Determines the bridge address based on the current network.
    - Calculates the portion of the total supply allocated to the bridge (`amountForBridge`).
    - Logs relevant deployment details to the console.
2. **Deployment:**
    - Deploys the `MAGToken` contract using the specified total supply and bridge address.
3. **Address Saving:**
    - Saves the deployed contract address and symbol to `deploymentAddresses.json`.
4. **Verification:**
    - If an Base API key is provided, attempts to verify the contract source code on Basescan.

**Helper Functions**

-   **`getBridgeAddress()`:** Returns the correct bridge address based on the network chain ID.
-   **`getAddressSaver()`:** (Imported from `utils/helpers`) Manages the storage of deployed contract addresses.
-   **`getTotalSupply()`:** (Imported from `utils/getTotalSupply`) Calculates the portion of the total supply allocated for the bridge.
-   **`addDec()`:** (Imported from `test/helpers`) Adds decimals to token amounts for calculations.
-   **`verify()`:** (Imported from `utils/helpers`) Handles contract verification on Etherscan.

**Key Points**

-   **Bridge Allocation:** The script automatically calculates and allocates a portion of the token supply to the specified bridge contract.
-   **Network Awareness:** The script dynamically determines the bridge address based on the current network, making it easier to deploy across different environments.
-   **Error Handling:** Includes basic error handling to log errors to the console.

## NFTY Bridge deployment

-   FIRST TRY TO RUN SCRIPTS ON TESTNETS

**NFTYBridge Contract Deployment and Verification Script**

**Purpose**

This script automates the deployment and verification process for the `NFTYBridge` contract on various Ethereum-compatible networks (ETH, BSC, Polygon) and their corresponding testnets.

**Prerequisites**

-   **Hardhat Development Environment:** Ensure you have Hardhat and its dependencies installed and configured correctly.
-   **Deployment Configuration:** The script assumes your `hardhat.config.js` file specifies the network you want to deploy to (e.g., Ethereum mainnet, BSC testnet) and other necessary settings.
-   **Etherscan API Key:** If you want to use the automatic verification feature, obtain an Etherscan API key and set it as an environment variable named `ETHERSCAN_API_KEY`, `POLYGONSCAN_API_KEY` and `BNBSCAN_API_KEY`.

**Execution**

1. **Preparation:**
    - Verify your Hardhat project setup and network configuration.
    - Set your `ETHERSCAN_API_KEY`, `POLYGONSCAN_API_KEY` and `BNBSCAN_API_KEY` environment variable if you want automatic verification.
2. **Deployment:**
    - Run the script from your terminal using:
      Ethereum testnet:
        ```bash
        npx hardhat run .scripts/deployment/deployNFTYBridge.ts --network sepolia
        ```
        Ethereum mainnet:
        ```bash
        npx hardhat run .scripts/deployment/deployNFTYBridge.ts --network mainnet
        ```
        Bsc testnet:
        ```bash
        npx hardhat run .scripts/deployment/deployNFTYBridge.ts --network bscTestnet
        ```
        Bsc mainnet:
        ```bash
        npx hardhat run .scripts/deployment/deployNFTYBridge.ts --network bsc
        ```
        Polygon testnet amoy:
        ```bash
        npx hardhat run .scripts/deployment/deployNFTYBridge.ts --network polygonAmoy
        ```
        Polygon mainnet:
        ```bash
        npx hardhat run .scripts/deployment/deployNFTYBridge.ts --network polygon
        ```

**Functionality**

1. **Initialization:**

    - Gets the deployer account.
    - Determines the network name and corresponding chain ID of the other network based on the current chain ID.
    - Logs relevant deployment information (network name, deployer address, chain IDs, relayer address, minimum refund wait time).

2. **Deployment:**

    - Fetches the `NFTYBridge` contract factory.
    - Deploys the contract as an upgradeable proxy, passing the following constructor arguments:
        - Chain ID of the other network
        - Relayer address
        - Minimum time to wait before refunds
        - Current network name

3. **Address Saving:**

    - Stores the deployed contract address in `deploymentAddresses.json` for future reference.

4. **Verification:**
    - If an API key is available, attempts to verify the contract source code on scan automatically.

**Helper Functions**

-   **`getNetworkName()`:** Dynamically determines the network name and corresponding chain ID for the other network, supporting ETH, BSC, and Polygon.
-   **`getAddressSaver()`:** (Imported) Manages the storage of deployed contract addresses.
-   **`verify()`:** (Imported) Handles contract verification on Etherscan.

**Configuration**

The `FIVE_MINUTES` constant sets the minimum time a user must wait before being able to refund a transaction. You can adjust this value if needed.

**Key Points**

-   **Multi-Network Support:** This script handles deployment across multiple Ethereum-compatible networks and their testnets.
-   **Upgradeable:** The `NFTYBridge` contract is deployed as an upgradeable proxy for future flexibility.
-   **Relayer:** The relayer address is crucial for cross-chain communication in the bridge contract. Make sure you have the correct address configured.
-   **Refund Time Lock:** The `FIVE_MINUTES` constant enforces a time delay before refunds are allowed, potentially to mitigate certain risks.

## SETUP Script

-   FIRST TRY TO RUN SCRIPTS ON TESTNETS

**Cross-Chain Bridge Setup Script**

**Purpose**

This script automates the setup process for the `NFTYBridge` and `MAGBridge` contracts on various Ethereum-compatible networks (ETH, Polygon, BSC, and Base) and their testnets. It specifically handles:

1. Whitelisting addresses.
2. Setting token allocations for whitelisted addresses.
3. Adding the bridged token to the bridge contract.

**Prerequisites**

-   **Deployment Addresses:** The script assumes you have already deployed the bridge contracts (`NFTYBridge` or `MAGBridge`) and their addresses are stored in variables.
-   **Snapshot Data:** The script requires JSON files (`tokenHoldersBsc.json`, `tokenHoldersEthereum.json`, `tokenHoldersPolygon.json`) containing wallet addresses and balances for the tokens to be bridged. These files are generated by snapshot scripts.

**Execution**

1. **Setup (Testnet or Mainnet):**
    - Run: `npx hardhat run ./scripts/setup.ts --network <your_network>`
    - Replace `<your_network>` with the appropriate network name (e.g., `sepolia`, `polygon`, `bscTestnet`, `baseSepolia`, `mainnet`, `base`, `polygonAmoy`).

**Functionality**

1. **Initialization:**

    - Gets the deployer account.
    - Determines the bridge address, token address, and network name based on the chosen network.
    - Fetches the whitelist and token allocations from the snapshot files.
    - Calculates the batch size for setting whitelist/allocations to avoid exceeding gas limits.

2. **Bridge Setup:**
    - **NFTY Bridge (ETH, Polygon, BSC):**
        - Sets whitelisted addresses and their allocations in batches if needed.
        - Adds the corresponding mock token address for testnets and the mainnet token address for mainnet deployments.
    - **MAG Bridge (Base):**
        - Adds the token address (mainnet or testnet).

**Helper Functions**

-   **`getWhitelistWithAllocations()`:** Reads whitelist and allocation data from the corresponding snapshot file based on the network.
-   **`getStepsAmount()`:** Calculates the batch size for setting whitelist/allocations.
-   **`getBridgeAddresses()`:** Retrieves the correct bridge and token addresses based on the network.

**Key Points**

-   **Network Flexibility:** Handles setup on different Ethereum-compatible networks and their testnets.
-   **Batching:** Splits the whitelisting and allocation processes into batches to avoid exceeding block gas limits.
-   **Token Integration:** Adds the bridged token to the bridge contract, with a distinction between mock tokens for testnets and actual tokens for mainnet.
-   **Snapshot Data:** Relies on external snapshot files for the list of holders and their balances.

**Important Note:**

Ensure that the bridge contracts have been properly deployed.
