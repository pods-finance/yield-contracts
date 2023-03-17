// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.17;

import { STETHVault } from "../vaults/STETHVault.sol";
import { STETH } from "./STETH.sol";

contract User {
    STETHVault private immutable vault;
    STETH private immutable asset;

    constructor(STETHVault _vault, STETH _asset) {
        vault = _vault;
        asset = _asset;

        asset.approve(address(vault), type(uint256).max);
    }

    function deposit(uint256 assets) external returns (uint256) {
        return vault.deposit(assets, address(this));
    }

    function mint(uint256 shares) external returns (uint256) {
        return vault.mint(shares, address(this));
    }

    function withdraw(uint256 assets) external returns (uint256) {
        return vault.withdraw(assets, address(this), address(this));
    }

    function redeem(uint256 shares) external returns (uint256) {
        return vault.redeem(shares, address(this), address(this));
    }
}
