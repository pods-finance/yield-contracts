import { Contract } from '@ethersproject/contracts'
import { expect } from 'chai'
import { ethers } from 'hardhat'
import { BigNumber } from 'ethers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'

describe('BaseVault', () => {
  let asset: Contract, vault: Contract, yieldSource: Contract
  let user0: SignerWithAddress, user1: SignerWithAddress,
    user2: SignerWithAddress, strategist: SignerWithAddress, proxy: SignerWithAddress
  let snapshotId: BigNumber

  before(async () => {
    ;[, user0, user1, user2, strategist, proxy] = await ethers.getSigners()
    const DepositQueueLib = await ethers.getContractFactory('DepositQueueLib')
    const depositQueueLib = await DepositQueueLib.deploy()

    const Asset = await ethers.getContractFactory('Asset')
    asset = await Asset.deploy('Asset', 'AST')

    const YieldSourceMock = await ethers.getContractFactory('YieldSourceMock')
    yieldSource = await YieldSourceMock.deploy(asset.address)

    const Vault = await ethers.getContractFactory('YieldVaultMock', {
      libraries: {
        DepositQueueLib: depositQueueLib.address
      }
    })
    vault = await Vault.deploy(asset.address, await strategist.getAddress(), yieldSource.address)

    await expect(vault.deployTransaction)
      .to.emit(vault, 'StartRound').withArgs(0, 0)

    await asset.connect(user0).approve(vault.address, ethers.constants.MaxUint256)
    await asset.connect(user1).approve(vault.address, ethers.constants.MaxUint256)
    await asset.connect(user2).approve(vault.address, ethers.constants.MaxUint256)
    await asset.connect(strategist).approve(vault.address, ethers.constants.MaxUint256)
    expect(await vault.name()).to.be.equal('Base Vault')
  })

  beforeEach(async () => {
    snapshotId = await ethers.provider.send('evm_snapshot', [])
  })

  afterEach(async () => {
    await ethers.provider.send('evm_revert', [snapshotId])
  })

  it('should add collateral and receive shares', async () => {
    const assets = ethers.utils.parseEther('10')
    const expectedShares = assets

    await asset.connect(user0).mint(assets)
    expect(await asset.balanceOf(user0.address)).to.be.equal(assets)

    // User0 deposits to vault
    await vault.connect(user0).deposit(assets, user0.address)
    expect(await vault.depositQueueSize()).to.be.equal(1)
    expect(await asset.balanceOf(user0.address)).to.be.equal(0)
    expect(await asset.balanceOf(vault.address)).to.be.equal(assets)
    expect(await vault.sharesOf(user0.address)).to.be.equal(0)
    expect(await vault.idleAmountOf(user0.address)).to.be.equal(assets)
    expect(await vault.isProcessingDeposits()).to.be.equal(false)

    // Process deposits
    // Since Round 0 started upon deployment, it should end the exact same round number "0"
    const endRoundTx = vault.connect(strategist).endRound()
    await expect(endRoundTx).to.emit(vault, 'EndRound').withArgs(0)
    expect(await vault.isProcessingDeposits()).to.be.equal(true)
    const depositProcessingTx = vault.connect(strategist).processQueuedDeposits(0, await vault.depositQueueSize())
    await expect(depositProcessingTx).to.emit(vault, 'DepositProcessed').withArgs(user0.address, 1, assets, expectedShares)
    expect(await vault.totalShares()).to.be.equal(expectedShares)
    expect(await vault.depositQueueSize()).to.be.equal(0)
    expect(await vault.sharesOf(user0.address)).to.be.equal(expectedShares)
    expect(await vault.idleAmountOf(user0.address)).to.be.equal(0)

    // Start round
    await vault.connect(strategist).startRound()
    expect(await vault.totalAssets()).to.be.equal(assets)
    expect(await asset.balanceOf(vault.address)).to.be.equal(0)
  })

  it('cannot call strategist functions without permission', async () => {
    await expect(vault.connect(user0).startRound()).to.be.revertedWith('IVault__CallerIsNotTheStrategist()')
    await expect(vault.connect(user0).endRound()).to.be.revertedWith('IVault__CallerIsNotTheStrategist()')
  })

  it('can deposit and withdraw on behalf', async () => {
    const assets = ethers.utils.parseEther('10')
    const expectedShares = assets

    expect(await asset.balanceOf(user0.address)).to.be.equal(0)
    await asset.connect(proxy).mint(assets)
    await asset.connect(proxy).approve(vault.address, assets)
    await vault.connect(proxy).deposit(assets, user0.address)
    expect(await vault.depositQueueSize()).to.be.equal(1)
    expect(await asset.balanceOf(vault.address)).to.be.equal(assets)
    expect(await vault.idleAmountOf(user0.address)).to.be.equal(assets)

    await vault.connect(strategist).endRound()
    await vault.connect(strategist).processQueuedDeposits(0, await vault.depositQueueSize())
    expect(await vault.totalShares()).to.be.equal(expectedShares)
    expect(await vault.depositQueueSize()).to.be.equal(0)
    expect(await vault.sharesOf(user0.address)).to.be.equal(expectedShares)
    expect(await vault.idleAmountOf(user0.address)).to.be.equal(0)

    await vault.connect(strategist).startRound()
    expect(await vault.allowance(user0.address, proxy.address)).to.be.equal(0)
    await vault.connect(user0).approve(proxy.address, expectedShares)
    expect(await vault.allowance(user0.address, proxy.address)).to.be.equal(expectedShares)
    await vault.connect(proxy).withdraw(user0.address)
    expect(await vault.allowance(user0.address, proxy.address)).to.be.equal(0)
    expect(await asset.balanceOf(user0.address)).to.be.equal(assets)
  })

  it('cannot withdraw on behalf without allowance', async () => {
    const assets = ethers.utils.parseEther('10')
    const expectedShares = assets

    await asset.connect(user0).mint(assets)
    await vault.connect(user0).deposit(assets, user0.address)
    expect(await vault.depositQueueSize()).to.be.equal(1)
    expect(await asset.balanceOf(vault.address)).to.be.equal(assets)
    expect(await vault.idleAmountOf(user0.address)).to.be.equal(assets)

    await vault.connect(strategist).endRound()
    await vault.connect(strategist).processQueuedDeposits(0, await vault.depositQueueSize())
    expect(await vault.totalShares()).to.be.equal(expectedShares)
    expect(await vault.depositQueueSize()).to.be.equal(0)
    expect(await vault.sharesOf(user0.address)).to.be.equal(expectedShares)
    expect(await vault.idleAmountOf(user0.address)).to.be.equal(0)

    await vault.connect(strategist).startRound()
    await expect(
      vault.connect(proxy).withdraw(user0.address)
    ).to.be.revertedWith('IVault__SharesExceedAllowance()')
  })

  it('cannot withdraw between a round\'s end and the beginning of the next', async () => {
    const assets = ethers.utils.parseEther('10')

    await asset.connect(user0).mint(assets)
    await vault.connect(user0).deposit(assets, user0.address)
    await vault.connect(strategist).endRound()
    await vault.connect(strategist).processQueuedDeposits(0, await vault.depositQueueSize())

    await expect(
      vault.connect(user0).withdraw(user0.address)
    ).to.be.revertedWith('IVault__ForbiddenWhileProcessingDeposits()')
  })

  it('cannot approve Address Zero', async () => {
    await expect(
      vault.connect(user0).approve(ethers.constants.AddressZero, 0)
    ).to.be.revertedWith('IVault__ApprovalToAddressZero()')
  })

  it('cannot deposit between a round\'s end and the beginning of the next', async () => {
    const assets = ethers.utils.parseEther('10')

    await asset.connect(user0).mint(assets)
    await vault.connect(strategist).endRound()
    await expect(
      vault.connect(user0).deposit(assets, user0.address)
    ).to.be.revertedWith('IVault__ForbiddenWhileProcessingDeposits()')
  })

  it('cannot processQueue After round started', async () => {
    const assets = ethers.utils.parseEther('10')

    await asset.connect(user0).mint(assets)
    await vault.connect(user0).deposit(assets, user0.address)
    await vault.connect(strategist).endRound()
    await vault.connect(strategist).startRound()
    await expect(vault.connect(strategist).processQueuedDeposits(0, await vault.depositQueueSize())).to.be.revertedWith('IVault__NotProcessingDeposits()')
  })

  it('withdraws proportionally', async () => {
    const assets = ethers.utils.parseEther('10')

    await asset.connect(user0).mint(assets.mul(2))
    await asset.connect(user1).mint(assets)

    // Users deposits to vault
    await vault.connect(user0).deposit(assets, user0.address)
    await vault.connect(user0).deposit(assets, user0.address)
    await vault.connect(user1).deposit(assets, user1.address)
    expect(await asset.balanceOf(vault.address)).to.be.equal(assets.mul(3))
    expect(await asset.balanceOf(user0.address)).to.be.equal(0)
    expect(await asset.balanceOf(user1.address)).to.be.equal(0)
    expect(await vault.depositQueueSize()).to.be.equal(2)
    expect(await vault.sharesOf(user0.address)).to.be.equal(0)
    expect(await vault.idleAmountOf(user0.address)).to.be.equal(assets.mul(2))
    expect(await vault.sharesOf(user1.address)).to.be.equal(0)
    expect(await vault.idleAmountOf(user1.address)).to.be.equal(assets)

    // Process deposits
    await vault.connect(strategist).endRound()
    await vault.connect(strategist).processQueuedDeposits(0, await vault.depositQueueSize())
    expect(await vault.depositQueueSize()).to.be.equal(0)
    const expectedUser0Shares = ethers.utils.parseEther('20')
    expect(await vault.sharesOf(user0.address)).to.be.equal(expectedUser0Shares)
    const expectedUser1Shares = ethers.utils.parseEther('10')
    expect(await vault.sharesOf(user1.address)).to.be.equal(expectedUser1Shares)
    expect(await vault.totalShares()).to.be.equal(expectedUser0Shares.add(expectedUser1Shares))

    // Starts round 1
    await vault.connect(strategist).startRound()

    // User0 withdraws
    expect(await vault.previewWithdraw(await vault.sharesOf(user0.address))).to.be.equal(assets.mul(2))
    await vault.connect(user0).withdraw(user0.address)
    expect(await asset.balanceOf(user0.address)).to.be.equal(assets.mul(2))
    expect(await vault.sharesOf(user0.address)).to.be.equal(0)
    expect(await vault.idleAmountOf(user0.address)).to.be.equal(0)

    // User1 withdraws
    expect(await vault.previewWithdraw(await vault.sharesOf(user1.address))).to.be.equal(assets)
    await vault.connect(user1).withdraw(user1.address)
    expect(await asset.balanceOf(user1.address)).to.be.equal(assets)
    expect(await vault.sharesOf(user1.address)).to.be.equal(0)
    expect(await vault.idleAmountOf(user1.address)).to.be.equal(0)

    // Vault is empty
    expect(await asset.balanceOf(vault.address)).to.be.equal(0)
  })

  it('redeposit test case', async () => {
    const assets = ethers.utils.parseEther('100')
    await asset.connect(user0).mint(assets.mul(2))
    await asset.connect(user1).mint(assets)

    expect(await asset.balanceOf(yieldSource.address)).to.be.equal(0)
    // Round 0
    await vault.connect(user0).deposit(assets, user0.address)
    await vault.connect(user1).deposit(assets, user1.address)
    await vault.connect(strategist).endRound()
    await vault.connect(strategist).processQueuedDeposits(0, await vault.depositQueueSize())

    // Round 1
    await vault.connect(strategist).startRound()
    await yieldSource.generateInterest(ethers.utils.parseEther('100'))
    await vault.connect(user0).deposit(assets, user0.address)

    // Accruing yield
    await vault.connect(strategist).endRound()
    await vault.connect(strategist).processQueuedDeposits(0, await vault.depositQueueSize())
    // expect(await vault.previewShares(user0Address)).to.be.equal(expectedShares)
    await vault.connect(strategist).startRound()

    await yieldSource.generateInterest(ethers.utils.parseEther('200')) // Accruing yield

    const expectedUser0Amount = ethers.utils.parseEther('375')
    const expectedUser1Amount = ethers.utils.parseEther('225')

    await vault.connect(user0).withdraw(user0.address)
    expect(await asset.balanceOf(user0.address)).to.be.equal(expectedUser0Amount)
    expect(await vault.sharesOf(user0.address)).to.be.equal(0)
    expect(await vault.idleAmountOf(user0.address)).to.be.equal(0)

    await vault.connect(user1).withdraw(user1.address)
    expect(await asset.balanceOf(user1.address)).to.be.equal(expectedUser1Amount)
    expect(await vault.sharesOf(user1.address)).to.be.equal(0)
    expect(await vault.idleAmountOf(user1.address)).to.be.equal(0)

    expect(await asset.balanceOf(vault.address)).to.be.equal(0)
    expect(await asset.balanceOf(yieldSource.address)).to.be.equal(0)
  })
})
