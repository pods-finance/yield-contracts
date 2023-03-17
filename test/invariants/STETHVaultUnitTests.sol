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
    STETHVault vault1 = new STETHVault(configuration, asset, address(investor));
    STETHVault vault2 = new STETHVault(configuration, asset, address(investor));

    uint256 private constant NUMBER_OF_USERS = 5;

    address[] private users = new address[](NUMBER_OF_USERS);
    mapping(address => uint256) shares;
    mapping(address => uint256) assets;

    constructor() {
        for (uint256 i = 0; i < NUMBER_OF_USERS; ++i) {
            users[i] = address(new User());
            assets[users[i]] = uint256(keccak256(abi.encodePacked(i + block.timestamp))) / (NUMBER_OF_USERS + 1); // total sum will not overflow
        }

        investor.approveVaultToPull(address(vault1));
        investor.approveVaultToPull(address(vault2));

        configuration.setParameter(address(vault1), "VAULT_CONTROLLER", uint256(uint160(address(this))));
        configuration.setParameter(address(vault2), "VAULT_CONTROLLER", uint256(uint160(address(this))));
    }

    function testProcessQueueIsOrderInvariant(bytes32 seed) public {
        // vault 1
        for (uint256 i = 0; i < NUMBER_OF_USERS; ++i) {
            User(users[i]).initialize(vault1, asset);
            User(users[i]).deposit(assets[users[i]]);
        }

        vault1.endRound();
        _shuffle(users, seed);
        vault1.processQueuedDeposits(users);
        vault1.startRound();
        assertGt(vault1.totalSupply(), 0, "vault must have shares");

        for (uint256 i = 0; i < NUMBER_OF_USERS; ++i) {
            shares[users[i]] = vault1.balanceOf(users[i]);
        }

        // vault 2
        for (uint256 i = 0; i < NUMBER_OF_USERS; ++i) {
            User(users[i]).initialize(vault2, asset);
            User(users[i]).deposit(assets[users[i]]);
        }

        vault2.endRound();
        _shuffle(users, seed);
        vault2.processQueuedDeposits(users);
        vault2.startRound();
        assertGt(vault2.totalSupply(), 0, "vault must have shares");

        for (uint256 i = 0; i < NUMBER_OF_USERS; ++i) {
            assertEq(shares[users[i]], vault2.balanceOf(users[i]), "Process deposits must be order invariant");
        }
    }

    function _shuffle(address[] storage addresses, bytes32 seed) internal {
        for (uint256 i = 0; i < addresses.length; i++) {
            uint256 j = i + (uint256(keccak256(abi.encodePacked(seed))) % (addresses.length - i));
            address temp = addresses[j];
            addresses[j] = addresses[i];
            addresses[i] = temp;
        }
    }
}
