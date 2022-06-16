//SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IERC4626 {
//    function previewDeposit(uint256 assets) external view override returns (uint256 shares);
//    function previewMint(uint256 shares) external view override returns (uint256 amount);
//    function previewWithdraw(uint256 assets) external view override returns (uint256 shares);
//    function previewRedeem(uint256 shares) external view override returns (uint256 amount);

    function convertToShares(uint256 assets) external view returns (uint256);
    function convertToAssets(uint256 shares) external view returns (uint256);

    function maxDeposit(address owner) external view returns (uint256);
    function maxMint(address owner) external view returns (uint256);
    function maxWithdraw(address owner) external view returns (uint256);
    function maxRedeem(address owner) external view returns (uint256);
}

interface IVault is IERC20, IERC4626 {
    error IVault__CallerIsNotTheController();
    error IVault__NotProcessingDeposits();
    error IVault__AlreadyProcessingDeposits();
    error IVault__ForbiddenWhileProcessingDeposits();

    event Deposit(address indexed owner, uint amountDeposited);
    event Withdraw(address indexed owner, uint sharesBurnt, uint amountWithdrawn);
    event StartRound(uint indexed roundId, uint amountAddedToStrategy);
    event EndRound(uint indexed roundId);
    event DepositProcessed(address indexed owner, uint indexed roundId, uint assets, uint shares);

    /**
     * @dev Returns the fee charged on withdraws.
     */
    function withdrawFeeRatio() external view returns(uint256);

    /**
     * @dev Returns the vault controller
     */
    function controller() external view returns(address);

    /**
     * @dev Deposits asset tokens, generating shares.
     * @param assets The amount of asset token to deposit
     * @param receiver The address to be owner of the shares
     */
    function deposit(uint256 assets, address receiver) external;

    /**
     * @dev Burn shares, withdrawing asset tokens.
     */
    function withdraw(address owner) external;
}
