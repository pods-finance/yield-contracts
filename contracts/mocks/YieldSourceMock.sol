// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./Asset.sol";

contract YieldSourceMock is ERC20("Interest Pool", "INTP") {
    using Math for uint256;
    using SafeERC20 for Asset;

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

    function generateInterest(uint256 amount) external {
        asset.mint(amount);
    }

    function deposit(uint256 amount, address receiver) external returns (uint256 shares) {
        shares = previewDeposit(amount);

        // Check for rounding error since we round down in previewDeposit.
        require(amount != 0, "Shares too low");

        _mint(receiver, shares);
        asset.safeTransferFrom(msg.sender, address(this), amount);
    }

    function withdraw(uint256 amount) external returns (uint256 shares) {
        shares = previewWithdraw(amount);

        _burn(msg.sender, shares);
        asset.safeTransfer(msg.sender, amount);
    }

    function redeem(uint256 shares) external returns (uint256 amount) {
        amount = previewRedeem(shares);

        // Check for rounding error since we round down in previewRedeem.
        require(amount != 0, "Shares too low");

        _burn(msg.sender, shares);
        asset.safeTransfer(msg.sender, amount);
    }

    function previewDeposit(uint256 amount) public view returns (uint256) {
        return convertToShares(amount);
    }

    function previewWithdraw(uint256 amount) public view returns (uint256) {
        uint256 supply = totalSupply();
        return supply == 0 ? amount : amount.mulDiv(supply, totalAssets(), Math.Rounding.Up);
    }

    function previewRedeem(uint256 shares) public view returns (uint256) {
        return convertToAssets(shares);
    }

    function totalAssets() public view returns (uint256) {
        return asset.balanceOf(address(this));
    }

    function convertToShares(uint256 amount) public view returns (uint256) {
        uint256 supply = totalSupply();
        return supply == 0 ? amount : amount.mulDiv(supply, totalAssets(), Math.Rounding.Down);
    }

    function convertToAssets(uint256 shares) public view returns (uint256) {
        uint256 supply = totalSupply();
        return supply == 0 ? shares : shares.mulDiv(totalAssets(), supply, Math.Rounding.Down);
    }
}
