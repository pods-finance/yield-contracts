import { expect } from 'chai'
import { ethers } from 'hardhat'
import { BigNumber } from 'ethers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import createConfigurationManager from '../utils/createConfigurationManager'
import feeExcluded from '../utils/feeExcluded'
import { Asset, ConfigurationManager, InvestorActorMock, PrincipalProtectedMock, YieldSourceMock } from '../../typechain'

describe('PrincipalProtectedMock', () => {
  let asset: Asset, vault: PrincipalProtectedMock, yieldSource: YieldSourceMock,
    investor: InvestorActorMock, configuration: ConfigurationManager

  let user0: SignerWithAddress, user1: SignerWithAddress, user2: SignerWithAddress, user3: SignerWithAddress,
    user4: SignerWithAddress, vaultController: SignerWithAddress

  let snapshotId: BigNumber

  before(async () => {
    ;[, user0, user1, user2, vaultController, user3, user4] = await ethers.getSigners()
    configuration = await createConfigurationManager()

    const DepositQueueLib = await ethers.getContractFactory('DepositQueueLib')
    const depositQueueLib = await DepositQueueLib.deploy()

    const Asset = await ethers.getContractFactory('Asset')
    asset = await Asset.deploy('Asset', 'AST')

    const YieldSourceMock = await ethers.getContractFactory('YieldSourceMock')
    yieldSource = await YieldSourceMock.deploy(asset.address)

    const InvestorActorMock = await ethers.getContractFactory('InvestorActorMock')
    investor = await InvestorActorMock.deploy(asset.address)

    const PrincipalProtectedETHBull = await ethers.getContractFactory('PrincipalProtectedMock', {
      libraries: {
        DepositQueueLib: depositQueueLib.address
      }
    })
    vault = await PrincipalProtectedETHBull.deploy(
      configuration.address,
      asset.address,
      investor.address,
      yieldSource.address
    )

    // Give approval upfront that the vault can pull money from the investor contract
    await investor.approveVaultToPull(vault.address)

    await configuration.setParameter(vault.address, ethers.utils.formatBytes32String('VAULT_CONTROLLER'), vaultController.address)
    await configuration.setParameter(vault.address, ethers.utils.formatBytes32String('WITHDRAW_FEE_RATIO'), BigNumber.from('100'))

    await asset.connect(user0).approve(vault.address, ethers.constants.MaxUint256)
    await asset.connect(user1).approve(vault.address, ethers.constants.MaxUint256)
    await asset.connect(user2).approve(vault.address, ethers.constants.MaxUint256)
    await asset.connect(vaultController).approve(vault.address, ethers.constants.MaxUint256)
  })

  beforeEach(async () => {
    snapshotId = await ethers.provider.send('evm_snapshot', [])
  })

  afterEach(async () => {
    await ethers.provider.send('evm_revert', [snapshotId])
  })

  it('should add collateral and receive shares', async () => {
    const assetAmount = ethers.utils.parseEther('100')

    await asset.connect(user0).mint(assetAmount)
    expect(await asset.balanceOf(user0.address)).to.be.equal(assetAmount)

    // User0 deposits to vault
    await vault.connect(user0).deposit(assetAmount, user0.address)
    expect(await vault.depositQueueSize()).to.be.equal(1)
    expect(await asset.balanceOf(user0.address)).to.be.equal(0)
    expect(await asset.balanceOf(vault.address)).to.be.equal(assetAmount)
    expect(await vault.balanceOf(user0.address)).to.be.equal(0)
    expect(await vault.idleBalanceOf(user0.address)).to.be.equal(assetAmount)

    // Process deposits
    const endRoundTx = vault.connect(vaultController).endRound()
    await expect(endRoundTx).to.emit(vault, 'EndRoundData').withArgs(0, 0, 0, assetAmount)
    await vault.connect(vaultController).processQueuedDeposits(0, await vault.depositQueueSize())
    expect(await vault.depositQueueSize()).to.be.equal(0)
    expect(await vault.balanceOf(user0.address)).to.be.equal(assetAmount)
    expect(await vault.idleBalanceOf(user0.address)).to.be.equal(0)

    // Start round
    await vault.connect(vaultController).startRound()
    expect(await asset.balanceOf(vault.address)).to.be.equal(0)
  })

  it('cannot withdraw between a round\'s end and the beginning of the next', async () => {
    const assetAmount = ethers.utils.parseEther('100')

    await asset.connect(user0).mint(assetAmount)
    await vault.connect(user0).deposit(assetAmount, user0.address)
    await vault.connect(vaultController).endRound()
    await vault.connect(vaultController).processQueuedDeposits(0, await vault.depositQueueSize())

    await expect(
      vault.connect(user0).redeem(await vault.balanceOf(user0.address), user0.address, user0.address)
    ).to.be.revertedWith('IVault__ForbiddenWhileProcessingDeposits()')
  })

  it('cannot deposit between a round\'s end and the beginning of the next', async () => {
    const assetAmount = ethers.utils.parseEther('10')

    await asset.connect(user0).mint(assetAmount)
    await vault.connect(vaultController).endRound()
    await expect(
      vault.connect(user0).deposit(assetAmount, user0.address)
    ).to.be.revertedWith('IVault__ForbiddenWhileProcessingDeposits()')
  })

  it('cannot processQueue After round started', async () => {
    const assetAmount = ethers.utils.parseEther('100')

    await asset.connect(user0).mint(assetAmount)
    await vault.connect(user0).deposit(assetAmount, user0.address)
    await vault.connect(vaultController).endRound()
    await vault.connect(vaultController).startRound()
    await expect(vault.connect(vaultController).processQueuedDeposits(0, await vault.depositQueueSize())).to.be.revertedWith('IVault__NotProcessingDeposits()')
  })

  it('withdraws proportionally', async () => {
    const assetAmount = ethers.utils.parseEther('100')

    await asset.connect(user0).mint(assetAmount.mul(2))
    await asset.connect(user1).mint(assetAmount)

    // Users deposits to vault
    await vault.connect(user0).deposit(assetAmount, user0.address)
    await vault.connect(user0).deposit(assetAmount, user0.address)
    await vault.connect(user1).deposit(assetAmount, user1.address)
    expect(await asset.balanceOf(vault.address)).to.be.equal(assetAmount.mul(3))
    expect(await asset.balanceOf(user0.address)).to.be.equal(0)
    expect(await asset.balanceOf(user1.address)).to.be.equal(0)
    expect(await vault.depositQueueSize()).to.be.equal(2)
    expect(await vault.balanceOf(user0.address)).to.be.equal(0)
    expect(await vault.idleBalanceOf(user0.address)).to.be.equal(assetAmount.mul(2))
    expect(await vault.balanceOf(user1.address)).to.be.equal(0)
    expect(await vault.idleBalanceOf(user1.address)).to.be.equal(assetAmount)

    // Process deposits
    await vault.connect(vaultController).endRound()
    await vault.connect(vaultController).processQueuedDeposits(0, await vault.depositQueueSize())
    expect(await vault.depositQueueSize()).to.be.equal(0)

    // Starts round 1
    await vault.connect(vaultController).startRound()

    // User0 withdraws
    await vault.connect(user0).redeem(await vault.balanceOf(user0.address), user0.address, user0.address)
    expect(await asset.balanceOf(user0.address)).to.be.equal(feeExcluded(assetAmount.mul(2)))
    expect(await vault.balanceOf(user0.address)).to.be.equal(0)
    expect(await vault.idleBalanceOf(user0.address)).to.be.equal(0)

    // User1 withdraws
    await vault.connect(user1).redeem(await vault.balanceOf(user1.address), user1.address, user1.address)
    expect(await asset.balanceOf(user1.address)).to.be.equal(feeExcluded(assetAmount))
    expect(await vault.balanceOf(user1.address)).to.be.equal(0)
    expect(await vault.idleBalanceOf(user1.address)).to.be.equal(0)

    // Vault is empty
    expect(await asset.balanceOf(vault.address)).to.be.equal(0)
  })

  it('full cycle test case', async () => {
    // This test will only work if InvestRatio = 50%
    const assetAmount = ethers.utils.parseEther('100')
    await asset.connect(user0).mint(assetAmount)
    await asset.connect(user1).mint(assetAmount)

    // Round 0
    await vault.connect(user0).deposit(assetAmount, user0.address)
    await vault.connect(vaultController).endRound()
    await vault.connect(vaultController).processQueuedDeposits(0, await vault.depositQueueSize())

    // Round 1
    await vault.connect(vaultController).startRound()
    await yieldSource.generateInterest(ethers.utils.parseEther('20'))
    await vault.connect(vaultController).endRound()

    // Round 2
    await vault.connect(vaultController).startRound()
    await vault.connect(user1).deposit(assetAmount, user1.address)
    await yieldSource.generateInterest(ethers.utils.parseEther('20'))
    await investor.generatePremium(ethers.utils.parseEther('1300'))
    await vault.connect(vaultController).endRound()
    await vault.connect(vaultController).processQueuedDeposits(0, await vault.depositQueueSize())

    // Round 3
    await vault.connect(vaultController).startRound()
    await yieldSource.generateInterest(ethers.utils.parseEther('70'))

    await vault.connect(user0).redeem(await vault.balanceOf(user0.address), user0.address, user0.address)
    await vault.connect(user1).redeem(await vault.balanceOf(user1.address), user1.address, user1.address)

    expect(await vault.totalSupply()).to.be.equal(0)
    expect(await vault.totalAssets()).to.be.equal(0)

    const expectedUser0Amount = feeExcluded('1495424836601307189542')
    const expectedUser1Amount = feeExcluded('104575163398692810458')

    expect(await asset.balanceOf(user0.address)).to.be.equal(expectedUser0Amount)
    expect(await vault.balanceOf(user0.address)).to.be.equal(0)
    expect(await vault.idleBalanceOf(user0.address)).to.be.equal(0)

    expect(await asset.balanceOf(user1.address)).to.be.equal(expectedUser1Amount)
    expect(await vault.balanceOf(user1.address)).to.be.equal(0)
    expect(await vault.idleBalanceOf(user1.address)).to.be.equal(0)

    expect(await vault.totalAssets()).to.be.equal(0)

    await vault.connect(vaultController).endRound()
    await vault.connect(vaultController).startRound()
  })

  it('underflow testcase', async () => {
  // This test will only work if InvestRatio = 50%
    const user0InitialBalance = ethers.utils.parseEther('500')
    const user1InitialBalance = ethers.utils.parseEther('100')
    const user2InitialBalance = ethers.utils.parseEther('6')
    const user3InitialBalance = ethers.utils.parseEther('10')
    const user4InitialBalance = ethers.utils.parseEther('8')

    await asset.connect(user0).mint(user0InitialBalance)
    await asset.connect(user0).approve(vault.address, ethers.constants.MaxUint256)
    await vault.connect(user0).deposit(user0InitialBalance.div(2), user0.address)

    await vault.connect(user0).deposit(user0InitialBalance.div(2), user0.address)

    await asset.connect(user1).mint(user1InitialBalance)
    await asset.connect(user1).approve(vault.address, ethers.constants.MaxUint256)
    await vault.connect(user1).deposit(user1InitialBalance, user1.address)

    await vault.connect(vaultController).endRound()
    await vault.connect(vaultController).processQueuedDeposits(0, 2)
    await vault.connect(vaultController).startRound()

    await vault.connect(user0).redeem(await vault.balanceOf(user0.address), user0.address, user0.address)

    await asset.connect(user2).mint(user2InitialBalance)
    await asset.connect(user2).approve(vault.address, ethers.constants.MaxUint256)
    await vault.connect(user2).deposit(user2InitialBalance.div(3), user2.address)

    await asset.connect(user3).mint(user3InitialBalance)
    await asset.connect(user3).approve(vault.address, ethers.constants.MaxUint256)
    await vault.connect(user3).deposit(user3InitialBalance, user3.address)

    await vault.connect(user2).deposit(user2InitialBalance.div(3).mul(2), user2.address)

    await vault.connect(vaultController).endRound()
    await vault.connect(vaultController).processQueuedDeposits(0, 2)
    await vault.connect(vaultController).startRound()

    await yieldSource.generateInterest(ethers.utils.parseEther('2'))

    await vault.connect(vaultController).endRound()
    await vault.connect(vaultController).startRound()

    await vault.connect(user2).redeem(await vault.balanceOf(user2.address), user2.address, user2.address)

    await asset.connect(user4).mint(user4InitialBalance)
    await asset.connect(user4).approve(vault.address, ethers.constants.MaxUint256)
    await vault.connect(user4).deposit(user4InitialBalance, user4.address)

    await vault.connect(vaultController).endRound()
    await vault.connect(vaultController).processQueuedDeposits(0, 1)
    await vault.connect(vaultController).startRound()

    await vault.connect(user1).redeem(await vault.balanceOf(user1.address), user1.address, user1.address)
    await vault.connect(user3).redeem(await vault.balanceOf(user3.address), user3.address, user3.address)
    await vault.connect(user4).redeem(await vault.balanceOf(user4.address), user4.address, user4.address)

    // Vault checks
    expect(await vault.totalAssets()).to.be.equal(0)
    expect(await vault.totalSupply()).to.be.equal(0)

    // User checks
    expect(await asset.balanceOf(user0.address)).to.be.gte(feeExcluded(user0InitialBalance))
    expect(await asset.balanceOf(user1.address)).to.be.gte(feeExcluded(user1InitialBalance))
    expect(await asset.balanceOf(user2.address)).to.be.gte(feeExcluded(user2InitialBalance))
    expect(await asset.balanceOf(user3.address)).to.be.gte(feeExcluded(user3InitialBalance))
    expect(await asset.balanceOf(user4.address)).to.be.gte(feeExcluded(user4InitialBalance))

    expect(await vault.balanceOf(user0.address)).to.be.equal(0)
    expect(await vault.balanceOf(user1.address)).to.be.equal(0)
    expect(await vault.balanceOf(user2.address)).to.be.equal(0)
    expect(await vault.balanceOf(user3.address)).to.be.equal(0)
    expect(await vault.balanceOf(user4.address)).to.be.equal(0)

    expect(await vault.idleBalanceOf(user0.address)).to.be.equal(0)
    expect(await vault.idleBalanceOf(user1.address)).to.be.equal(0)
    expect(await vault.idleBalanceOf(user2.address)).to.be.equal(0)
    expect(await vault.idleBalanceOf(user3.address)).to.be.equal(0)
    expect(await vault.idleBalanceOf(user4.address)).to.be.equal(0)
  })
})
