//SPDX-License-Identifier: GPL3.0
pragma solidity >=0.8.11;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

contract Vault is ERC20("Lisbon Asset Management", "LIS") {
    address public constant STRATEGIST = 0xe3AfAEd05D953579F4A1c0fb99e43C5034760831;

    mapping(address => bool) private _allowedDepositTokens;
    mapping(address => address) private _operators;
    bool public withdrawOpen = false;

    event Deposited(address indexed owner, address token, uint amount);
    event Withdrawn(address indexed owner, address token, uint amount);
    event Approval(address indexed owner, address indexed operator);
    event AllowedDepositTokenSet(address token, bool allowed);
    event WithdrawsOpen(uint timestamp, bool open);

    error TokenDepositNotAllowed();
    error CallerIsNotStrategist();
    error CallerIsNotOwnerOrApproved();

    constructor(address[] allowedDepositTokens) {
        for(uint i = 0; i < allowedDepositTokens.length; i++) {
            _allowedDepositTokens[allowedDepositTokens[i]] = true;
            emit AllowedDepositTokenSet(allowedDepositTokens[i], true);
        }
    }

    function setAllowedDepositToken(address token, bool allowed) public {
        if(msg.sender != STRATEGIST) revert CallerIsNotStrategist();

        _allowedDepositTokens[token] = allowed;
        emit AllowedDepositTokenSet(token, allowed);
    }

    function setWithdrawWindow(bool open) public {
        if(msg.sender != STRATEGIST) revert CallerIsNotStrategist();

        withdrawOpen = open;
        emit WithdrawsOpen(block.timestamp, open);
    }

    function deposit(address token, uint amount, address owner) public {
        if(!_allowedDepositTokens[token]) revert TokenDepositNotAllowed();

        IERC20Metadata(token).transferFrom(msg.sender, address(this), amount);
        IERC20Metadata(token).transfer(STRATEGIST, amount);

        emit Deposited(owner, token, amount);
    }

    function withdraw(address[] tokens, address owner) public {
        if(_isApprovedOrOwner(owner, msg.sender)) revert CallerIsNotOwnerOrApproved();

        for(uint i = 0; i < tokens.length; i++) {
            IERC20Metadata(token).transfer(owner, amount);
            emit Withdrawn(owner, token, amount);
        }
    }

    function setOperator(address operator) external {
        _operators[msg.sender] = operator;
        emit Approval(msg.sender, operator);
    }

    function _isApprovedOrOwner(address owner, address operator) internal returns(bool) {
        return operator == owner || _operators[owner] == operator;
    }
}
