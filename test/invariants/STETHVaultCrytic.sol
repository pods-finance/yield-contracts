// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.17;

import "@crytic/properties/contracts/ERC4626/ERC4626PropertyTests.sol";
import "@crytic/properties/contracts/ERC4626/util/TestERC20Token.sol";
import "@crytic/properties/contracts/util/PropertiesHelper.sol";
import "@crytic/properties/contracts/ERC4626/util/IERC4626Internal.sol";

import "../../contracts/vaults/STETHVault.sol";

import "../../contracts/configuration/ConfigurationManager.sol";
import "../../contracts/mocks/InvestorActorMock.sol";

contract STETHVaultHarness is STETHVault, PropertiesAsserts {
    uint256 private constant MAX_REBASE = 100;

    constructor(
        IConfigurationManager _configuration,
        IERC20Metadata _asset,
        address _investor
    ) STETHVault(_configuration, _asset, _investor, uint256(5000)) {}

    // considers a single deposit on each round
    function deposit(uint256 assets, address receiver) public virtual override returns (uint256) {
        require(assets > 0, "Cannot deposit 0 assets");
        if (this.totalSupply() == 0) {
            require(assets >= this.MIN_INITIAL_ASSETS(), "First deposit must be at least MIN_INITIAL_ASSETS");
        }
        uint256 shares = super.deposit(assets, receiver);
        require(shares > 0, "Cannot mint 0 shares");

        this.endRound();
        this.processQueuedDeposits(this.queuedDeposits());
        this.startRound();

        return shares;
    }

    // considers a single mint on each round
    function mint(uint256 shares, address receiver) public virtual override returns (uint256) {
        require(shares > 0, "Cannot mint 0 shares");
        uint256 assets = previewMint(shares);
        if (this.totalSupply() == 0) {
            require(assets >= this.MIN_INITIAL_ASSETS(), "First deposit must be at least MIN_INITIAL_ASSETS");
        }

        assets = super.mint(assets, receiver);
        require(assets > 0, "Cannot deposit 0 assets");

        this.endRound();
        this.processQueuedDeposits(this.queuedDeposits());
        this.startRound();

        return assets;
    }
}

contract STETHVaultCrytic is CryticERC4626PropertyTests {
    constructor() {
        TestERC20Token _asset = new TestERC20Token("Test Token", "TT", 18);
        ConfigurationManager _configuration = new ConfigurationManager();
        InvestorActorMock _investor = new InvestorActorMock(address(_asset));
        STETHVaultHarness _vault = new STETHVaultHarness(
            _configuration,
            IERC20Metadata(address(_asset)),
            address(_investor)
        );

        initialize(address(_vault), address(_asset), false);
        _configuration.setParameter(address(vault), "VAULT_CONTROLLER", uint256(uint160(address(vault))));
    }
}
