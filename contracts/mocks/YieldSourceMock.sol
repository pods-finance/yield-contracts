// SPDX-License-Identifier: UNLICENSED

pragma solidity >=0.8.6;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../libs/FixedPointMath.sol";
import "./Asset.sol";

contract YieldSourceMock is ERC20("Interest Pool", "INTP") {
    using FixedPointMath for uint;

    Asset public immutable asset;

    constructor(address _asset) {
        asset = Asset(_asset);
    }

    function name() public view override returns (string memory) {
        return string(abi.encodePacked(super.name(), " ", asset.symbol()));
    }

    function symbol() public view override returns (string memory) {
        return string(abi.encodePacked("INTP-", asset.symbol()));
    }

    function generateInterest(uint amount) external {
        asset.mint(amount);
    }

    function deposit(uint amount, address receiver) external returns(uint shares) {
        shares = previewDeposit(amount);

        // Check for rounding error since we round down in previewDeposit.
        require(amount != 0, "Shares too low");

        asset.transferFrom(msg.sender, address(this), amount);
        _mint(receiver, shares);
    }

    function withdraw(uint amount) external returns(uint shares) {
        shares = previewWithdraw(amount);

        _burn(msg.sender, shares);
        asset.transfer(msg.sender, amount);
    }

    function redeem(uint shares) external returns(uint amount) {
        amount = previewRedeem(shares);

        // Check for rounding error since we round down in previewRedeem.
        require(amount != 0, "Shares too low");

        _burn(msg.sender, shares);
        asset.transfer(msg.sender, amount);
    }

    function previewDeposit(uint amount) public view returns (uint) {
        return convertToShares(amount);
    }

    function previewWithdraw(uint amount) public view returns (uint) {
        uint supply = totalSupply();
        return supply == 0 ? amount : amount.mulDivUp(supply, totalAssets());
    }

    function previewRedeem(uint shares) public view returns (uint) {
        return convertToAssets(shares);
    }

    function totalAssets() public view returns(uint) {
        return asset.balanceOf(address(this));
    }

    function convertToShares(uint amount) public view returns (uint) {
        uint supply = totalSupply();
        return supply == 0 ? amount : amount.mulDivDown(supply, totalAssets());
    }

    function convertToAssets(uint shares) public view returns (uint) {
        uint supply = totalSupply();
        return supply == 0 ? shares : shares.mulDivDown(totalAssets(), supply);
    }
}
