// SPDX-License-Identifier: UNLICENSED

pragma solidity >=0.8.6;

import "../../contracts/mocks/Asset.sol";
import "../../contracts/vaults/STETHVault.sol";
import "../../contracts/configuration/ConfigurationManager.sol";
import "../../contracts/mocks/InvestorActorMock.sol";

contract STETH is Asset {
    constructor() Asset("Liquid staked Ether 2.0", "stETH") {}

    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) public override returns (bool) {
        _mint(from, amount);
        _transfer(from, to, amount);
        return true;
    }
}

library String {
    function equal(string memory a, string memory b) internal pure returns(bool) {
        return keccak256(bytes(a)) == keccak256(bytes(b));
    }
}

contract STETHVaultInvariants is STETHVault {
    ConfigurationManager public $configuration = new ConfigurationManager();
    STETH public $asset = new STETH();
    InvestorActorMock public $investor = new InvestorActorMock(address($asset));

    constructor() STETHVault($configuration, $asset, address($investor)) {
        $configuration.setParameter(address(this), "VAULT_CONTROLLER", 0x30000);
    }

    function echidna_test_name() public view returns(bool) {
        return String.equal(name(), "Pods Yield stETH");
    }

    function echidna_test_symbol() public returns(bool) {
        return String.equal(symbol(), "pystETH");
    }

    function echidna_test_decimals() public returns(bool) {
        return decimals() == $asset.decimals();
    }
}
