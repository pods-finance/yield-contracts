// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.17;

import "@crytic/properties/contracts/ERC4626/ERC4626PropertyTests.sol";
import "@crytic/properties/contracts/ERC4626/util/TestERC20Token.sol";

import "../../contracts/vaults/STETHVault.sol";

import "../../contracts/configuration/ConfigurationManager.sol";
import "../../contracts/mocks/InvestorActorMock.sol";

contract STETHVaultCrytic is CryticERC4626PropertyTests {
    constructor() {
        TestERC20Token _asset = new TestERC20Token("Test Token", "TT", 18);
        ConfigurationManager _configuration = new ConfigurationManager();
        InvestorActorMock _investor = new InvestorActorMock(address(_asset));
        STETHVault _vault = new STETHVault(_configuration, IERC20Metadata(address(_asset)), address(_investor));
        initialize(address(_vault), address(_asset), false);
    }
}
