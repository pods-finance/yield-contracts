import { expect } from 'chai'
import hre, { ethers } from 'hardhat'
import { BigNumber } from 'ethers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import minus from '../utils/minus'
import { startMainnetFork, stopMainnetFork } from '../utils/mainnetFork'
import createConfigurationManager from '../utils/createConfigurationManager'
import { ConfigurationManager, ERC20, InvestorActorMock, STETHVault } from '../../typechain'

describe('STETHVault', () => {
  let asset: ERC20, vault: STETHVault, investor: InvestorActorMock,
    configuration: ConfigurationManager

  let user0: SignerWithAddress, user1: SignerWithAddress,
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

    ;[, , , , vaultController] = await ethers.getSigners()
    configuration = await createConfigurationManager({ controller: vaultController.address })

    const DepositQueueLib = await ethers.getContractFactory('DepositQueueLib')
    const depositQueueLib = await DepositQueueLib.deploy()

    // Lido's stEth
    asset = await ethers.getContractAt('ERC20', '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84')

    const InvestorActorMock = await ethers.getContractFactory('InvestorActorMock')
    investor = await InvestorActorMock.deploy(asset.address)

    const STETHVault = await ethers.getContractFactory('STETHVault', {
      libraries: {
        DepositQueueLib: depositQueueLib.address
      }
    })
    vault = await STETHVault.deploy(
      configuration.address,
      asset.address,
      investor.address
    )

    // Give approval upfront that the vault can pull money from the investor contract
    await investor.approveVaultToPull(vault.address)

    await asset.connect(user0).approve(vault.address, ethers.constants.MaxUint256)
    await asset.connect(user1).approve(vault.address, ethers.constants.MaxUint256)
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
    expect(await vault.idleAmountOf(user0.address)).to.be.equal(assetAmount)

    // Process deposits
    await vault.connect(vaultController).endRound()
    await vault.connect(vaultController).processQueuedDeposits(0, await vault.depositQueueSize())
    expect(await vault.depositQueueSize()).to.be.equal(0)
    expect(await vault.balanceOf(user0.address)).to.be.equal(assetAmount)
    expect(await vault.idleAmountOf(user0.address)).to.be.equal(0)

    // Start round
    await vault.connect(vaultController).startRound()
  })

  it('cannot withdraw between a round\'s end and the beginning of the next', async () => {
    const assetAmount = ethers.utils.parseEther('100')

    await vault.connect(user0).deposit(assetAmount, user0.address)
    await vault.connect(vaultController).endRound()
    await vault.connect(vaultController).processQueuedDeposits(0, await vault.depositQueueSize())

    await expect(
      vault.connect(user0).withdraw(user0.address)
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
    expect(await vault.idleAmountOf(user0.address)).to.be.equal(assetAmountUser0)
    expect(await vault.balanceOf(user1.address)).to.be.equal(0)
    expect(await vault.idleAmountOf(user1.address)).to.be.equal(assetAmountUser1)

    // Process deposits
    await vault.connect(vaultController).endRound()
    await vault.connect(vaultController).processQueuedDeposits(0, await vault.depositQueueSize())
    expect(await vault.depositQueueSize()).to.be.equal(0)

    // Starts round 1
    await vault.connect(vaultController).startRound()

    // User0 withdraws
    await vault.connect(user0).withdraw(user0.address)
    expect(await vault.balanceOf(user0.address)).to.be.equal(0)
    expect(await vault.idleAmountOf(user0.address)).to.be.equal(0)

    // User1 withdraws
    await vault.connect(user1).withdraw(user1.address)
    expect(await vault.balanceOf(user1.address)).to.be.equal(0)
    expect(await vault.idleAmountOf(user1.address)).to.be.equal(0)
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
    // await asset.connect(yieldGenerator).transfer(vault.address, ethers.utils.parseEther('20'))
    // await investor.generatePremium(ethers.utils.parseEther('1300'))
    await asset.connect(yieldGenerator).transfer(vault.address, ethers.utils.parseEther('1320'))
    await vault.connect(vaultController).endRound()
    await vault.connect(vaultController).processQueuedDeposits(0, await vault.depositQueueSize())

    // Round 3
    await vault.connect(vaultController).startRound()
    await asset.connect(yieldGenerator).transfer(vault.address, ethers.utils.parseEther('70'))

    const expectedUser0Amount = BigNumber.from('803225806451612903218')
    const expectedUser1Amount = BigNumber.from('96774193548387096779')

    await expect(async () => await vault.connect(user0).withdraw(user0.address))
      .to.changeTokenBalances(
        asset,
        [vault, user0],
        [minus(expectedUser0Amount), expectedUser0Amount]
      )
    await expect(async () => await vault.connect(user1).withdraw(user1.address))
      .to.changeTokenBalances(
        asset,
        [vault, user1],
        [minus(expectedUser1Amount).add(1), expectedUser1Amount]
      )

    expect(await vault.balanceOf(user0.address)).to.be.equal(0)
    expect(await vault.idleAmountOf(user0.address)).to.be.equal(0)

    expect(await vault.balanceOf(user1.address)).to.be.equal(0)
    expect(await vault.idleAmountOf(user1.address)).to.be.equal(0)
  })
})
