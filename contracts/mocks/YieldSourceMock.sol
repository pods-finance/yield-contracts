// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.17;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC4626 } from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { Asset } from "./Asset.sol";

contract YieldSourceMock is ERC20, ERC4626 {
    Asset private _asset;
    string private _name;
    string private _symbol;

    constructor(Asset $asset) ERC20("Interest Pool", "INTP") ERC4626($asset) {
        _asset = $asset;
        _name = string(abi.encodePacked($asset.name(), " ", $asset.symbol()));
        _symbol = string(abi.encodePacked("INTP-", $asset.symbol()));
    }

    function name() public view override(ERC20, IERC20Metadata) returns (string memory) {
        return _name;
    }

    function symbol() public view override(ERC20, IERC20Metadata) returns (string memory) {
        return _symbol;
    }

    function generateInterest(uint256 amount) external {
        _asset.mint(amount);
    }
}
