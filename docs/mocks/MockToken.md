# Solidity API

## MockToken

### _decimals

```solidity
uint8 _decimals
```

### onlyOwner

```solidity
modifier onlyOwner()
```

### constructor

```solidity
constructor(string name, string symbols, uint8 decimalsNumber) public
```

### decimals

```solidity
function decimals() public view returns (uint8)
```

_Returns the number of decimals used to get its user representation.
For example, if `decimals` equals `2`, a balance of `505` tokens should
be displayed to a user as `5.05` (`505 / 10 ** 2`).

Tokens usually opt for a value of 18, imitating the relationship between
Ether and Wei. This is the value {ERC20} uses, unless this function is
overridden;

NOTE: This information is only used for _display_ purposes: it in
no way affects any of the arithmetic of the contract, including
{IERC20-balanceOf} and {IERC20-transfer}._

### mintFor

```solidity
function mintFor(address _receiver, uint256 _amount) external
```

Mints desired amount of tokens for the recipient

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| _receiver | address | Receiver of the tokens. |
| _amount | uint256 | Amount (in wei - smallest decimals) |

### mint

```solidity
function mint(uint256 _amount) external
```

