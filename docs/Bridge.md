# Solidity API

## AmountIsLessThanMinimum

```solidity
error AmountIsLessThanMinimum(uint256 amount, uint256 minAmount)
```

## AmountIsNotEqualToMsgValue

```solidity
error AmountIsNotEqualToMsgValue(uint256 amount, uint256 msgValue)
```

## NonceIsUsed

```solidity
error NonceIsUsed(uint256 nonce)
```

## NonceIsRefunded

```solidity
error NonceIsRefunded(uint256 nonce)
```

## TokenIsNotSupported

```solidity
error TokenIsNotSupported(address token)
```

## RefundIsBlocked

```solidity
error RefundIsBlocked(uint256 nonce)
```

## MinTimeToRefundIsNotReached

```solidity
error MinTimeToRefundIsNotReached(uint256 minTimeToRefund, uint256 creationTime)
```

## OnlyRelayerOrCreatorCanRefund

```solidity
error OnlyRelayerOrCreatorCanRefund(uint256 nonce)
```

## MsgValueShouldBeZero

```solidity
error MsgValueShouldBeZero()
```

## FailedToSendEther

```solidity
error FailedToSendEther()
```

## MinTimeToWaitBeforeRefundIsTooBig

```solidity
error MinTimeToWaitBeforeRefundIsTooBig(uint256 minTimeToWaitBeforeRefund)
```

## Bridge

### NonceInfo

```solidity
struct NonceInfo {
  address token;
  address creator;
  address to;
  uint256 amount;
  uint256 creationTime;
}
```

### RELAYER_ROLE

```solidity
bytes32 RELAYER_ROLE
```

Role required to withdraw and refund tokens from the bridge

### secondChainId

```solidity
uint24 secondChainId
```

Chain ID of the second chain

### minTimeToWaitBeforeRefund

```solidity
uint256 minTimeToWaitBeforeRefund
```

Minimum time to wait before refunding a transaction

### wrappedNative

```solidity
address wrappedNative
```

Address of the wrapped native token

### tokenIsSupported

```solidity
mapping(address => bool) tokenIsSupported
```

Mapping of supported tokens (token => isSupported)

### allWhitelistedTokens

```solidity
address[] allWhitelistedTokens
```

Mapping of all added addresses in whitelist

### minAmountForToken

```solidity
mapping(address => uint256) minAmountForToken
```

Mapping of minimum amount for tokens (token => minAmount)

### otherChainToken

```solidity
mapping(address => address) otherChainToken
```

Mapping of other chain tokens (token => otherChainToken)

### nonce

```solidity
uint256 nonce
```

Unique nonce for each send transaction

### nonceIsUsed

```solidity
mapping(uint256 => bool) nonceIsUsed
```

Mapping of used nonces (nonce => isUsed)

### nonceInfo

```solidity
mapping(uint256 => struct Bridge.NonceInfo) nonceInfo
```

Mapping of nonce info (nonce => NonceInfo)

### nonceIsBlockedForRefund

```solidity
mapping(uint256 => bool) nonceIsBlockedForRefund
```

Mapping of blocked nonces for refund (nonce => isBlocked)

### nonceIsRefunded

```solidity
mapping(uint256 => bool) nonceIsRefunded
```

Mapping of used nonces for refund (nonce => isRefunded)

### Refund

```solidity
event Refund(address token, address to, uint256 amount, uint256 nonce)
```

### BlockRefund

```solidity
event BlockRefund(uint256 nonce)
```

### Send

```solidity
event Send(address token, address tokenOnSecondChain, address to, uint256 amount, uint256 nonce)
```

### Withdraw

```solidity
event Withdraw(address token, address tokenOnSecondChain, address to, uint256 amount, uint256 nonce)
```

### AddToken

```solidity
event AddToken(address token, address tokenOnSecondChain, uint256 minAmount)
```

### RemoveToken

```solidity
event RemoveToken(address token)
```

### NewWrappedNative

```solidity
event NewWrappedNative(address oldWrappedNative, address newWrappedNative)
```

### EmergencyWithdraw

```solidity
event EmergencyWithdraw(address token, address to, uint256 amount)
```

### NewMinTimeToWaitBeforeRefund

```solidity
event NewMinTimeToWaitBeforeRefund(uint256 minTimeToWaitBeforeRefund)
```

### NewMinAmountForToken

```solidity
event NewMinAmountForToken(address token, uint256 minAmount)
```

### NewOtherChainToken

```solidity
event NewOtherChainToken(address token, address otherChainToken)
```

### onlySupportedToken

```solidity
modifier onlySupportedToken(address token)
```

Modifier to check if the token is supported

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| token | address | Address of the token |

### receive

```solidity
receive() external payable
```

### initialize

```solidity
function initialize(uint24 _secondChainId, address _wrappedNative, uint256 _minAmountForNative, address _otherChainTokenForNative, address _relayer, uint256 _minTimeToWaitBeforeRefund) public
```

function to initialize the contract

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _secondChainId | uint24 | Chain ID of the second chain |
| _wrappedNative | address | Address of the wrapped native token |
| _minAmountForNative | uint256 | Minimum amount for the wrapped native token |
| _otherChainTokenForNative | address | Address on the other chain of the token for the wrapped native token |
| _relayer | address | Address of the relayer |
| _minTimeToWaitBeforeRefund | uint256 | Minimum time to wait before refunding a transaction |

### send

```solidity
function send(address token, address to, uint256 amount) external payable
```

function to send tokens to the second chain

_the function can be called only for a supported token and only emits a specific event for the backend to listen to_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| token | address | Address of the token |
| to | address | Address of the receiver on the second chain |
| amount | uint256 | Amount of tokens to send |

### blockRefund

```solidity
function blockRefund(uint256 nonceToBlock) external
```

function to block a nonce for refund

_the function can be called only by a relayer and should be called before withdrawing on the second chain_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| nonceToBlock | uint256 | Nonce to block |

### refund

```solidity
function refund(uint256 nonceToRefund) external
```

function to refund a sending transaction

_the function can be called only by a relayer, admin or the creator of the transaction_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| nonceToRefund | uint256 | Nonce of the transaction to refund |

### withdraw

```solidity
function withdraw(address token, address to, uint256 amount, uint256 nonceOnOtherChain) external
```

function to withdraw tokens from the second chain

_the function can be called only by a relayer and should be called after blocking the nonce for refund_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| token | address | Address of the token |
| to | address | Address of the receiver on the second chain |
| amount | uint256 | Amount of tokens to withdraw |
| nonceOnOtherChain | uint256 | Nonce of the transaction on the first chain |

### emergencyWithdraw

```solidity
function emergencyWithdraw(address token, address to, uint256 amount) external
```

function to withdraw tokens from the bridge contract

_can be called only in the paused state by the admin_

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| token | address | Address of the token |
| to | address | Address of the receiver |
| amount | uint256 | Amount of tokens to withdraw |

### addToken

```solidity
function addToken(address token, address tokenOnSecondChain, uint256 minAmount) public
```

function to add a new token to the bridge

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| token | address | Address of the token |
| tokenOnSecondChain | address | Address of the token on the second chain |
| minAmount | uint256 | Minimum amount of tokens to send |

### removeToken

```solidity
function removeToken(address token) public
```

function to remove a token from the bridge

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| token | address | Address of the token |

### setMinAmountForToken

```solidity
function setMinAmountForToken(address token, uint256 minAmount) external
```

function to set the minimum amount of tokens to send

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| token | address | Address of the token |
| minAmount | uint256 | Minimum amount of tokens to send |

### setOtherChainToken

```solidity
function setOtherChainToken(address token, address tokenOnSecondChain) external
```

function to set the address of the token on the second chain

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| token | address | Address of the token |
| tokenOnSecondChain | address | Address of the token on the second chain |

### setTimeToWaitBeforeRefund

```solidity
function setTimeToWaitBeforeRefund(uint256 _minTimeToWaitBeforeRefund) external
```

function to set the minimum time to wait before refunding a transaction

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _minTimeToWaitBeforeRefund | uint256 | Minimum time to wait before refunding a transaction |

### pause

```solidity
function pause() public
```

function to pause the bridge

### unpause

```solidity
function unpause() public
```

function to unpause the bridge

### setNewWrappedNative

```solidity
function setNewWrappedNative(address _wrappedNative) external
```

function to set the address of the wrapped native token

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _wrappedNative | address | Address of the wrapped native token |

### allWhitelistedTokensLength

```solidity
function allWhitelistedTokensLength() external view returns (uint256)
```

function to get the length of all whitelisted tokens

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Length of all whitelisted tokens |

### getAllWhitelistedTokens

```solidity
function getAllWhitelistedTokens() external view returns (address[])
```

function to get all whitelisted tokens

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address[] | Array of all whitelisted tokens |

### _authorizeUpgrade

```solidity
function _authorizeUpgrade(address newImplementation) internal
```

function to ensure that only admin can upgrade the contract

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| newImplementation | address | Address of the new implementation |

