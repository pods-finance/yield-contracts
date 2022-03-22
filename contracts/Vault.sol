//SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.6;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "./interfaces/IVault.sol";
import "./libs/TransferUtils.sol";

contract Vault is IVault, ERC20 {
    using TransferUtils for IERC20Metadata;

    IERC20Metadata public immutable underlying;

    constructor(string memory name, string memory symbol, address _underlying) ERC20(name, symbol) {
        underlying = IERC20Metadata(_underlying);
    }

    function stake(uint amount) public virtual {
        uint shareAmount = previewShares(amount);

        underlying.safeTransferFrom(msg.sender, address(this), amount);
        _mint(msg.sender, shareAmount);

        afterStake(amount, shareAmount);

        emit Stake(msg.sender, shareAmount, amount);
    }

    function claim() public virtual {
        uint shareAmount = balanceOf(msg.sender);
        if (shareAmount == 0) revert CallerHasNoShares();

        uint claimableUnderlying = previewClaim(shareAmount);

        beforeClaim(claimableUnderlying, shareAmount);
        _burn(msg.sender, shareAmount);
        underlying.transfer(msg.sender, claimableUnderlying);

        emit Claim(msg.sender, shareAmount, claimableUnderlying);
    }

    function totalAssets() public view virtual returns(uint) {
        return underlying.balanceOf(address(this));
    }

    // Accounting

    function previewShares(uint underlyingAmount) public view virtual returns(uint) {
        uint shareAmount = underlyingAmount;
        uint _totalSupply = totalSupply();

        if (_totalSupply > 0) {
            shareAmount = (underlyingAmount * _totalSupply) / underlying.balanceOf(address(this));
        }

        return shareAmount;
    }

    function previewClaim(uint shareAmount) public view virtual returns(uint) {
        return (shareAmount * totalSupply()) / underlying.balanceOf(address(this));
    }

    // Hooks
    function afterStake(uint underlyingAmount, uint shareAmount) internal virtual {}
    function beforeClaim(uint underlyingAmount, uint shareAmount) internal virtual {}
}
