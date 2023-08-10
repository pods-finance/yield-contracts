// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.17;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC4626 } from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { RebasingWrapper } from "../proxy/RebasingWrapper.sol";
import { WstETH } from "./WstETH.sol";


contract WrapperAsYieldSourceMock is RebasingWrapper {
    WstETH private _asset;
    string private _name;
    string private _symbol;

    constructor(WstETH $asset) RebasingWrapper(payable($asset)) {
        _asset = $asset;
        _name = string(abi.encodePacked("WrapperAsYieldSourceMock"));
        _symbol = string(abi.encodePacked("WAYSM"));
    }

    function name() public view override returns (string memory) {
        return _name;
    }

    function symbol() public view override returns (string memory) {
        return _symbol;
    }

    function decimals() public view override returns (uint8) {
        return super.decimals();
    }

    function generateInterest(uint256 amount) external {
        _asset.mint(amount);
    }
}
