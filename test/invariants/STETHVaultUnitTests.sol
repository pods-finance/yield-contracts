// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.17;

import "@crytic/properties/contracts/util/PropertiesHelper.sol";

import "../../contracts/mocks/STETH.sol";
import "../../contracts/mocks/User.sol";
import "../../contracts/vaults/STETHVault.sol";
import "../../contracts/configuration/ConfigurationManager.sol";
import "../../contracts/mocks/InvestorActorMock.sol";

contract STETHVaultUnitTests is PropertiesAsserts {
    STETH private asset = new STETH();
    ConfigurationManager configuration = new ConfigurationManager();
    InvestorActorMock investor = new InvestorActorMock(address(asset));
    mapping(address => uint256) private shares;

    constructor() {}

    function testProcessQueueIsOrderInvariant(bytes32 seed) public {
        uint8 shuffleTimes = 9;
        uint8 numberOfUsers = 5;
        address[] memory users = new address[](numberOfUsers);
        uint256[] memory assets = new uint256[](numberOfUsers);
        for (uint256 i = 0; i < numberOfUsers; ++i) {
            users[i] = address(new User());
            assets[i] = uint256(keccak256(abi.encodePacked(uint256(seed) - i)));
        }

        for (uint256 t = 0; t < shuffleTimes; ++t) {
            STETHVault vault = new STETHVault(configuration, asset, address(investor));
            investor.approveVaultToPull(address(vault));
            configuration.setParameter(address(vault), "VAULT_CONTROLLER", uint256(uint160(address(this))));

            for (uint256 i = 0; i < numberOfUsers; ++i) {
                User(users[i]).initialize(vault, asset);
                User(users[i]).deposit(assets[i]);
            }

            assertGt(vault.totalSupply(), 0, "vault must receive deposits");

            vault.endRound();
            _shuffle(users, assets, seed);
            vault.processQueuedDeposits(users);
            vault.startRound();

            for (uint256 i = 0; i < numberOfUsers; ++i) {
                uint256 previousShares = shares[users[i]];
                if (t > 0) {
                    assertEq(previousShares, vault.balanceOf(users[i]), "Process deposits must be order invariant");
                }
                shares[users[i]] = vault.balanceOf(users[i]) + i;
            }
        }

        for (uint256 i = 0; i < numberOfUsers; ++i) {
            shares[users[i]] = 0;
        }
    }

    function _shuffle(address[] memory addresses, uint256[] memory values, bytes32 seed) internal pure {
        for (uint256 i = 0; i < addresses.length; ++i) {
            uint256 j = i + (uint256(keccak256(abi.encodePacked(seed))) % (addresses.length - i));
            address tempAddress = addresses[j];
            addresses[j] = addresses[i];
            addresses[j] = tempAddress;

            uint256 tempValue = values[j];
            values[j] = values[i];
            values[j] = tempValue;
        }
    }
}
