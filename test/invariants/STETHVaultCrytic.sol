// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.17;

import "@crytic/properties/contracts/ERC4626/ERC4626PropertyTests.sol";
import "@crytic/properties/contracts/ERC4626/util/TestERC20Token.sol";
import "@crytic/properties/contracts/util/PropertiesHelper.sol";
import "@crytic/properties/contracts/ERC4626/util/IERC4626Internal.sol";

import "../../contracts/vaults/STETHVault.sol";

import "../../contracts/configuration/ConfigurationManager.sol";
import "../../contracts/mocks/InvestorActorMock.sol";

contract STETHVaultHarness is STETHVault, PropertiesAsserts, CryticIERC4626Internal {
    constructor(
        IConfigurationManager _configuration,
        IERC20Metadata _asset,
        address _investor
    ) STETHVault(_configuration, _asset, _investor, uint256(5000)) {}

    // considers a single deposit on each round
    function deposit(uint256 assets, address receiver) public virtual override returns (uint256) {
        if (this.totalSupply() == 0) {
            require(assets >= this.MIN_INITIAL_ASSETS(), "first deposit must be at least MIN_INITIAL_ASSETS");
        }
        uint256 shares = super.deposit(assets, receiver);

        this.endRound();
        this.processQueuedDeposits(this.queuedDeposits());
        this.startRound();
        return shares;
    }

    // considers a single mint on each round
    function mint(uint256 shares, address receiver) public virtual override returns (uint256) {
        uint256 assets = previewMint(shares);
        if (this.totalSupply() == 0) {
            require(assets >= this.MIN_INITIAL_ASSETS(), "first deposit must be at least MIN_INITIAL_ASSETS");
        }

        assets = super.mint(assets, receiver);

        this.endRound();
        this.processQueuedDeposits(this.queuedDeposits());
        this.startRound();
        return assets;
    }

    function recognizeProfit(uint256 profit) public {
        TestERC20Token(address(asset())).mint(address(this), profit);
    }

    function recognizeLoss(uint256 loss) public {
        TestERC20Token(address(asset())).burn(address(this), loss);
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

        initialize(address(_vault), address(_asset), true);
        _configuration.setParameter(address(vault), "VAULT_CONTROLLER", uint256(uint160(address(vault))));
    }
}
