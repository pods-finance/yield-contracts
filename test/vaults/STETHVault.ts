import { expect } from 'chai'
import hre, { ethers } from 'hardhat'
import { BigNumber } from 'ethers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import minus from '../utils/minus'
import { startMainnetFork, stopMainnetFork } from '../utils/mainnetFork'
import createConfigurationManager from '../utils/createConfigurationManager'
import { feeExcluded } from '../utils/feeExcluded'
import { ConfigurationManager, ERC20, InvestorActorMock, STETHVault } from '../../typechain'

describe('STETHVault', () => {
  let asset: ERC20, vault: STETHVault, investor: InvestorActorMock,
    configuration: ConfigurationManager

  let user0: SignerWithAddress, user1: SignerWithAddress, user2: SignerWithAddress, user3: SignerWithAddress,
    yieldGenerator: SignerWithAddress, vaultController: SignerWithAddress

  let snapshotId: BigNumber

  before(async () => {
    await startMainnetFork()

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: ['0x06601571aa9d3e8f5f7cdd5b993192618964bab5']
    })

    user0 = await ethers.getSigner('0x06601571aa9d3e8f5f7cdd5b993192618964bab5')

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: ['0x6cf9aa65ebad7028536e353393630e2340ca6049']
    })

    user1 = await ethers.getSigner('0x6cf9aa65ebad7028536e353393630e2340ca6049')

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: ['0xcebb2d6335ffa869f86f04a169015f9b613c2c04']
    })

    yieldGenerator = await ethers.getSigner('0xcebb2d6335ffa869f86f04a169015f9b613c2c04')

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: ['0x0c67f4ffc902140c972ecab356c9993e6ce8caf3']
    })

    user2 = await ethers.getSigner('0x0c67f4ffc902140c972ecab356c9993e6ce8caf3')

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: ['0x1c11ba15939e1c16ec7ca1678df6160ea2063bc5']
    })

    user3 = await ethers.getSigner('0x1c11ba15939e1c16ec7ca1678df6160ea2063bc5')

    ;[, , , , vaultController] = await ethers.getSigners()
    configuration = await createConfigurationManager()

    // Lido's stEth
    asset = await ethers.getContractAt('ERC20', '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84')

    const InvestorActorMock = await ethers.getContractFactory('InvestorActorMock')
    investor = await InvestorActorMock.deploy(asset.address)

    const STETHVault = await ethers.getContractFactory('STETHVault')
    vault = await STETHVault.deploy(
      configuration.address,
      asset.address,
      investor.address
    )

    // Give approval upfront that the vault can pull money from the investor contract
    await investor.approveVaultToPull(vault.address)

    await configuration.setParameter(vault.address, ethers.utils.formatBytes32String('VAULT_CONTROLLER'), vaultController.address)
    await configuration.setParameter(vault.address, ethers.utils.formatBytes32String('WITHDRAW_FEE_RATIO'), BigNumber.from('100'))

    await asset.connect(user0).approve(vault.address, ethers.constants.MaxUint256)
    await asset.connect(user1).approve(vault.address, ethers.constants.MaxUint256)
    await asset.connect(user2).approve(vault.address, ethers.constants.MaxUint256)
    await asset.connect(user3).approve(vault.address, ethers.constants.MaxUint256)
    await asset.connect(vaultController).approve(vault.address, ethers.constants.MaxUint256)
  })

  beforeEach(async () => {
    snapshotId = await ethers.provider.send('evm_snapshot', [])
  })

  afterEach(async () => {
    await ethers.provider.send('evm_revert', [snapshotId])
  })

  after(async () => {
    await stopMainnetFork()
  })

  describe('ERC20 checks', () => {
    it('has a name', async () => {
      expect(await vault.name()).to.be.equal(`${await asset.symbol()} Volatility Vault`)
    })

    it('has a symbol', async () => {
      expect(await vault.symbol()).to.be.equal(`${await asset.symbol()}vv`)
    })

    it('has decimals', async () => {
      expect(await vault.decimals()).to.be.equal(await asset.decimals())
    })
  })

  describe('Reading functions', () => {
    it('should match maxWithdraw and real withdraw balances', async () => {
      const assets = ethers.utils.parseEther('100')
      const user0Deposit = assets.mul(2)
      const user1Deposit = assets

      await vault.connect(user0).deposit(user0Deposit, user0.address)
      await vault.connect(user1).deposit(user1Deposit, user1.address)
      await vault.connect(vaultController).endRound()
      await vault.connect(vaultController).processQueuedDeposits(0, await vault.depositQueueSize())
      // Round 1
      await vault.connect(vaultController).startRound()
      await asset.connect(yieldGenerator).transfer(vault.address, ethers.utils.parseEther('103'))

      const user0maxWithdraw = await vault.maxWithdraw(user0.address)
      const user1maxWithdraw = await vault.maxWithdraw(user1.address)

      await expect(async () => await vault.connect(user0).redeem(await vault.balanceOf(user0.address), user0.address, user0.address))
        .to.changeTokenBalance(
          asset,
          user0,
          user0maxWithdraw.sub(1)
        )

      await expect(async () => await vault.connect(user1).redeem(await vault.balanceOf(user1.address), user1.address, user1.address))
        .to.changeTokenBalance(
          asset,
          user1,
          user1maxWithdraw.add(2)
        )

      const vaultBalance = await asset.balanceOf(vault.address)
      const user0BalanceOf = await vault.balanceOf(user0.address)
      const user1BalanceOf = await vault.balanceOf(user1.address)

      expect(vaultBalance).to.be.closeTo('0', 2)
      expect(user0BalanceOf).to.be.equal('0')
      expect(user1BalanceOf).to.be.equal('0')
    })

    it('should match maxRedeem and real withdraw balances', async () => {
      const assets = ethers.utils.parseEther('100')
      const user0Deposit = assets.mul(2)
      const user1Deposit = assets

      await vault.connect(user0).deposit(user0Deposit, user0.address)
      await vault.connect(user1).deposit(user1Deposit, user1.address)
      await vault.connect(vaultController).endRound()
      await vault.connect(vaultController).processQueuedDeposits(0, await vault.depositQueueSize())
      // Round 1
      await vault.connect(vaultController).startRound()
      await asset.connect(yieldGenerator).transfer(vault.address, ethers.utils.parseEther('103'))

      const user0maxRedeem = await vault.maxRedeem(user0.address)
      const user1maxRedeem = await vault.maxRedeem(user1.address)

      const user0maxShares = await vault.balanceOf(user0.address)
      const user1maxShares = await vault.balanceOf(user1.address)

      expect(user0maxRedeem).to.be.equal(user0maxShares)
      expect(user1maxRedeem).to.be.equal(user1maxShares)
    })
  })

  describe('Lifecycle', () => {
    it('cannot withdraw between a round\'s end and the beginning of the next', async () => {
      const assetAmount = ethers.utils.parseEther('100')

      await vault.connect(user0).deposit(assetAmount, user0.address)
      await vault.connect(vaultController).endRound()
      await vault.connect(vaultController).processQueuedDeposits(0, await vault.depositQueueSize())

      await expect(
        vault.connect(user0).redeem(await vault.balanceOf(user0.address), user0.address, user0.address)
      ).to.be.revertedWith('IVault__ForbiddenWhileProcessingDeposits()')
    })

    it('cannot deposit between a round\'s end and the beginning of the next', async () => {
      const assetAmount = ethers.utils.parseEther('10')

      await vault.connect(vaultController).endRound()
      await expect(
        vault.connect(user0).deposit(assetAmount, user0.address)
      ).to.be.revertedWith('IVault__ForbiddenWhileProcessingDeposits()')
    })

    it('cannot processQueue After round started', async () => {
      const assetAmount = ethers.utils.parseEther('10')

      await vault.connect(user0).deposit(assetAmount, user0.address)
      await vault.connect(vaultController).endRound()
      await vault.connect(vaultController).startRound()
      await expect(vault.connect(vaultController).processQueuedDeposits(0, await vault.depositQueueSize())).to.be.revertedWith('IVault__NotProcessingDeposits()')
    })

    it('cannot start or end rounds twice', async () => {
      await vault.connect(vaultController).endRound()
      await expect(vault.connect(vaultController).endRound())
        .to.be.revertedWith('IVault__AlreadyProcessingDeposits()')

      await vault.connect(vaultController).startRound()
      await expect(vault.connect(vaultController).startRound())
        .to.be.revertedWith('IVault__NotProcessingDeposits()')
    })
  })

  it('should add collateral and receive shares', async () => {
    const assetAmount = ethers.utils.parseEther('10')
    const assetAmountEffective = assetAmount.sub(1)

    // User0 deposits to vault
    await expect(async () => await vault.connect(user0).deposit(assetAmount, user0.address))
      .to.changeTokenBalances(
        asset,
        [user0, vault],
        [minus(assetAmountEffective), assetAmountEffective]
      )
    expect(await vault.depositQueueSize()).to.be.equal(1)
    expect(await vault.balanceOf(user0.address)).to.be.equal(0)
    expect(await vault.idleAssetsOf(user0.address)).to.be.closeTo(assetAmount, 1)

    // Process deposits
    await vault.connect(vaultController).endRound()
    await vault.connect(vaultController).processQueuedDeposits(0, await vault.depositQueueSize())
    expect(await vault.depositQueueSize()).to.be.equal(0)
    expect(await vault.balanceOf(user0.address)).to.be.closeTo(assetAmount, 1)
    expect(await vault.idleAssetsOf(user0.address)).to.be.equal(0)

    // Start round
    await vault.connect(vaultController).startRound()
  })

  it('withdraws proportionally', async () => {
    const assetAmount = ethers.utils.parseEther('10')
    const assetAmountUser0 = assetAmount.mul(2)
    const assetAmountUser0Effective = assetAmountUser0.sub(1)
    const assetAmountUser1 = assetAmount
    const assetAmountUser1Effective = assetAmountUser1
    const effectiveTotal = assetAmountUser0Effective.add(assetAmountUser1Effective)

    // Users deposits to vault
    await expect(async () => await vault.connect(user0).deposit(assetAmountUser0, user0.address))
      .to.changeTokenBalances(
        asset,
        [user0, vault],
        [minus(assetAmountUser0Effective), assetAmountUser0Effective]
      )
    await expect(async () => await vault.connect(user1).deposit(assetAmountUser1, user1.address))
      .to.changeTokenBalances(
        asset,
        [user1, vault],
        [minus(assetAmountUser1Effective), assetAmountUser1Effective]
      )

    expect(await asset.balanceOf(vault.address)).to.be.equal(effectiveTotal)
    expect(await vault.depositQueueSize()).to.be.equal(2)
    expect(await vault.balanceOf(user0.address)).to.be.equal(0)
    expect(await vault.idleAssetsOf(user0.address)).to.be.closeTo(assetAmountUser0, 1)
    expect(await vault.balanceOf(user1.address)).to.be.equal(0)
    expect(await vault.idleAssetsOf(user1.address)).to.be.closeTo(assetAmountUser1, 1)

    // Process deposits
    await vault.connect(vaultController).endRound()
    await vault.connect(vaultController).processQueuedDeposits(0, await vault.depositQueueSize())
    expect(await vault.depositQueueSize()).to.be.equal(0)

    // Starts round 1
    await vault.connect(vaultController).startRound()

    // User0 withdraws
    await vault.connect(user0).redeem(await vault.balanceOf(user0.address), user0.address, user0.address)
    expect(await vault.balanceOf(user0.address)).to.be.equal(0)
    expect(await vault.idleAssetsOf(user0.address)).to.be.equal(0)

    // User1 withdraws
    await vault.connect(user1).redeem(await vault.balanceOf(user1.address), user1.address, user1.address)
    expect(await vault.balanceOf(user1.address)).to.be.equal(0)
    expect(await vault.idleAssetsOf(user1.address)).to.be.equal(0)
  })

  it('full cycle test case', async () => {
    // This test will only work if InvestRatio = 50%
    const assetAmount = ethers.utils.parseEther('100')

    // Round 0
    await vault.connect(user0).deposit(assetAmount, user0.address)
    await vault.connect(vaultController).endRound()
    await vault.connect(vaultController).processQueuedDeposits(0, await vault.depositQueueSize())

    // Round 1
    await vault.connect(vaultController).startRound()
    await asset.connect(yieldGenerator).transfer(vault.address, ethers.utils.parseEther('20'))
    await vault.connect(vaultController).endRound()

    // Round 2
    await vault.connect(vaultController).startRound()
    await vault.connect(user1).deposit(assetAmount, user1.address)
    await asset.connect(yieldGenerator).transfer(vault.address, ethers.utils.parseEther('20'))
    await asset.connect(yieldGenerator).transfer(investor.address, ethers.utils.parseEther('1300'))
    await vault.connect(vaultController).endRound()
    await vault.connect(vaultController).processQueuedDeposits(0, await vault.depositQueueSize())

    // Round 3
    await vault.connect(vaultController).startRound()
    await asset.connect(yieldGenerator).transfer(vault.address, ethers.utils.parseEther('70'))

    const expectedUser0Amount = BigNumber.from('1495424836601307189536')
    const expectedUser1Amount = BigNumber.from('104575163398692810460')

    await expect(async () =>
      await vault.connect(user0).redeem(await vault.balanceOf(user0.address), user0.address, user0.address)
    )
      .to.changeTokenBalances(
        asset,
        [vault, user0],
        [minus(expectedUser0Amount.sub(1)), feeExcluded(expectedUser0Amount)]
      )

    await expect(async () =>
      await vault.connect(user1).redeem(await vault.balanceOf(user1.address), user1.address, user1.address)
    )
      .to.changeTokenBalances(
        asset,
        [vault, user1],
        [minus(expectedUser1Amount), feeExcluded(expectedUser1Amount).add(1)]
      )

    expect(await asset.balanceOf(vault.address)).to.be.closeTo(BigNumber.from(0), 1)
    expect(await vault.balanceOf(user0.address)).to.be.equal(0)
    expect(await vault.balanceOf(user1.address)).to.be.equal(0)
    expect(await vault.totalIdleAssets()).to.be.equal(0)
  })

  it('sanity check + startRound forgetting the process the queue case', async () => {
    // This test will only work if InvestRatio = 50%
    const user0Deposit = ethers.utils.parseEther('10')
    const user1Deposit = ethers.utils.parseEther('20')
    const user2Deposit = ethers.utils.parseEther('30')
    const user3Deposit = ethers.utils.parseEther('103')

    // Round 0
    await vault.connect(user0).deposit(user0Deposit, user0.address)
    await vault.connect(user1).deposit(user1Deposit, user1.address)
    await vault.connect(user2).deposit(user2Deposit, user2.address)
    await vault.connect(vaultController).endRound()

    await vault.connect(vaultController).processQueuedDeposits(0, await vault.depositQueueSize())

    await vault.connect(vaultController).startRound()

    const user0Moment1maxWithdraw = await vault.maxWithdraw(user0.address)
    const user1Moment1maxWithdraw = await vault.maxWithdraw(user1.address)
    const user2Moment1maxWithdraw = await vault.maxWithdraw(user2.address)
    // console.log(‘MOMENT 1 - Should have the same amounts’)
    expect(user0Moment1maxWithdraw).to.be.closeTo(feeExcluded(user0Deposit), 1)
    expect(user1Moment1maxWithdraw).to.be.closeTo(feeExcluded(user1Deposit), 1)
    expect(user2Moment1maxWithdraw).to.be.closeTo(feeExcluded(user2Deposit), 1)

    await asset.connect(yieldGenerator).transfer(vault.address, ethers.utils.parseEther('100'))

    const user0Moment2maxWithdraw = await vault.maxWithdraw(user0.address)
    const user1Moment2maxWithdraw = await vault.maxWithdraw(user1.address)
    const user2Moment2maxWithdraw = await vault.maxWithdraw(user2.address)

    // console.log(‘MOMENT 2 - Should have amounts greather than MOMENT 1’)
    expect(user0Moment2maxWithdraw).to.be.gte(user0Moment1maxWithdraw)
    expect(user1Moment2maxWithdraw).to.be.gte(user1Moment1maxWithdraw)
    expect(user2Moment2maxWithdraw).to.be.gte(user2Moment1maxWithdraw)

    await vault.connect(user3).deposit(user3Deposit, user3.address)

    const user0Moment3maxWithdraw = await vault.maxWithdraw(user0.address)
    const user1Moment3maxWithdraw = await vault.maxWithdraw(user1.address)
    const user2Moment3maxWithdraw = await vault.maxWithdraw(user2.address)

    // console.log(‘MOMENT 3 - Should have same amounts of 2’)
    expect(user0Moment3maxWithdraw).to.be.closeTo(user0Moment2maxWithdraw, 1)
    expect(user1Moment3maxWithdraw).to.be.closeTo(user1Moment2maxWithdraw, 1)
    expect(user2Moment3maxWithdraw).to.be.closeTo(user2Moment2maxWithdraw, 1)

    await vault.connect(vaultController).endRound()

    const user0Moment4maxWithdraw = await vault.maxWithdraw(user0.address)
    const user1Moment4maxWithdraw = await vault.maxWithdraw(user1.address)
    const user2Moment4maxWithdraw = await vault.maxWithdraw(user2.address)

    // console.log(‘MOMENT 4 - Should have less amount than 3 -> transfered some funds to investor’)
    expect(user0Moment4maxWithdraw).to.be.lte(user0Moment3maxWithdraw)
    expect(user1Moment4maxWithdraw).to.be.lte(user1Moment3maxWithdraw)
    expect(user2Moment4maxWithdraw).to.be.lte(user2Moment3maxWithdraw)

    await vault.connect(vaultController).startRound()

    const user0Moment5maxWithdraw = await vault.maxWithdraw(user0.address)
    const user1Moment5maxWithdraw = await vault.maxWithdraw(user1.address)
    const user2Moment5maxWithdraw = await vault.maxWithdraw(user2.address)

    // console.log(‘MOMENT 5 - Should have same amount as MOMENT 4’)
    expect(user0Moment5maxWithdraw).to.be.closeTo(user0Moment4maxWithdraw, 1)
    expect(user1Moment5maxWithdraw).to.be.closeTo(user1Moment4maxWithdraw, 1)
    expect(user2Moment5maxWithdraw).to.be.closeTo(user2Moment4maxWithdraw, 1)

    await investor.buyOptionsWithYield()

    const user0Moment6maxWithdraw = await vault.maxWithdraw(user0.address)
    const user1Moment6maxWithdraw = await vault.maxWithdraw(user1.address)
    const user2Moment6maxWithdraw = await vault.maxWithdraw(user2.address)

    // console.log(‘MOMENT 6 - Should have same amount as MOMENT 5 and 4’)
    expect(user0Moment6maxWithdraw).to.be.closeTo(user0Moment5maxWithdraw, 1)
    expect(user1Moment6maxWithdraw).to.be.closeTo(user1Moment5maxWithdraw, 1)
    expect(user2Moment6maxWithdraw).to.be.closeTo(user2Moment5maxWithdraw, 1)

    await asset.connect(yieldGenerator).transfer(investor.address, ethers.utils.parseEther('600'))
    // await investor.generatePremium(ethers.utils.parseEther(‘600’))

    const user0Moment7maxWithdraw = await vault.maxWithdraw(user0.address)
    const user1Moment7maxWithdraw = await vault.maxWithdraw(user1.address)
    const user2Moment7maxWithdraw = await vault.maxWithdraw(user2.address)

    // console.log(‘MOMENT 7 - Should have same amount as MOMENTS 6, 5, and 4’)
    expect(user0Moment7maxWithdraw).to.be.closeTo(user0Moment6maxWithdraw, 1)
    expect(user1Moment7maxWithdraw).to.be.closeTo(user1Moment6maxWithdraw, 1)
    expect(user2Moment7maxWithdraw).to.be.closeTo(user2Moment6maxWithdraw, 1)

    await vault.connect(vaultController).endRound()

    const user0Moment8maxWithdraw = await vault.maxWithdraw(user0.address)
    const user1Moment8maxWithdraw = await vault.maxWithdraw(user1.address)
    const user2Moment8maxWithdraw = await vault.maxWithdraw(user2.address)

    // console.log(‘MOMENT 8 - Should have more amount than MOMENT 7’)
    expect(user0Moment8maxWithdraw).to.be.gt(user0Moment7maxWithdraw)
    expect(user1Moment8maxWithdraw).to.be.gt(user1Moment7maxWithdraw)
    expect(user2Moment8maxWithdraw).to.be.gt(user2Moment7maxWithdraw)

    await vault.connect(vaultController).startRound()

    const user0Moment9maxWithdraw = await vault.maxWithdraw(user0.address)
    const user1Moment9maxWithdraw = await vault.maxWithdraw(user1.address)
    const user2Moment9maxWithdraw = await vault.maxWithdraw(user2.address)

    // console.log(‘MOMENT 9 - Should have the same amount as MOMENT 8’)
    expect(user0Moment9maxWithdraw).to.be.closeTo(user0Moment8maxWithdraw, 1)
    expect(user1Moment9maxWithdraw).to.be.closeTo(user1Moment8maxWithdraw, 1)
    expect(user2Moment9maxWithdraw).to.be.closeTo(user2Moment8maxWithdraw, 1)

    const sharesAmount0 = await vault.balanceOf(user0.address)
    const sharesAmount1 = await vault.balanceOf(user1.address)
    const sharesAmount2 = await vault.balanceOf(user2.address)

    // console.log(‘MOMENT 10 - Should have the same amount as 8 and 9 minus fee’)
    await expect(async () =>
      await vault.connect(user0).redeem(sharesAmount0, user0.address, user0.address)
    )
      .to.changeTokenBalance(
        asset,
        user0,
        user0Moment9maxWithdraw.sub(1)
      )

    await expect(async () =>
      await vault.connect(user1).redeem(sharesAmount1, user1.address, user1.address)
    )
      .to.changeTokenBalance(
        asset,
        user1,
        user1Moment9maxWithdraw
      )

    await expect(async () =>
      await vault.connect(user2).redeem(sharesAmount2, user2.address, user2.address)
    )
      .to.changeTokenBalance(
        asset,
        user2,
        user2Moment9maxWithdraw
      )
  })
})
