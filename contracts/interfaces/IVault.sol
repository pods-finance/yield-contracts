//SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.6;

interface IVault {
    error IVault__CallerHasNotEnoughShares();
    error IVault__CallerIsNotTheStrategist();
    error IVault__NotProcessingDeposits();
    error IVault__ForbiddenWhileProcessingDeposits();
    error IVault__ApprovalToAddressZero();
    error IVault__SharesExceedAllowance();

    event Deposit(address indexed owner, uint amountDeposited);
    event Withdraw(address indexed owner, uint sharesBurnt, uint amountWithdrawn);
    event StartRound(uint indexed roundId, uint amountAddedToStrategy);
    event EndRound(uint indexed roundId);
    event DepositProcessed(address indexed owner, uint indexed roundId, uint assets, uint shares);
    event Approval(address indexed owner, address indexed spender, uint256 amount);

    /**
     * @dev Returns the name of the Vault.
     */
    function name() external view returns(string memory);

    /**
     * @dev Deposits underlying tokens, generating shares.
     * @param assets The amount of asset token to deposit
     * @param receiver The address to be owner of the shares
     */
    function deposit(uint256 assets, address receiver) external;

    /**
     * @dev Burn shares, withdrawing underlying tokens.
     */
    function withdraw(address owner) external;

    /**
     * @dev Returns the remaining number of shares that `spender` will be
     * allowed to spend on behalf of `owner` through {withdraw}. This is
     * zero by default.
     *
     * This value changes when {approve} or {withdraw} are called.
     */
    function allowance(address owner, address spender) external view returns(uint256);

    /**
     * @dev Sets `amount` as the allowance of `spender` over the caller's shares.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Note that approving `type(uint256).max` is considered unlimited approval and should not be spent.
     *
     * Emits an {Approval} event.
     */
    function approve(address spender, uint256 amount) external returns (bool);
}
