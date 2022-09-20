import { expect } from 'chai'
import hre, { ethers } from 'hardhat'
import { BigNumber } from 'ethers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import minus from '../utils/minus'
import { startMainnetFork, stopMainnetFork } from '../utils/mainnetFork'
import createConfigurationManager from '../utils/createConfigurationManager'
import { feeExcluded } from '../utils/feeExcluded'
import { ConfigurationManager, ERC20, ETHAdapter, ICurvePool, InvestorActorMock, STETHVault } from '../../typechain'
import { signERC2612Permit } from 'eth-permit'

describe('ETHAdapter', () => {
  let asset: ERC20, vault: STETHVault, investor: InvestorActorMock,
    configuration: ConfigurationManager, adapter: ETHAdapter, pool: ICurvePool

  let user0: SignerWithAddress, vaultController: SignerWithAddress, userPermit: SignerWithAddress

  let snapshotId: BigNumber

  before(async () => {
    await startMainnetFork()

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: ['0x06601571aa9d3e8f5f7cdd5b993192618964bab5']
    })

    user0 = await ethers.getSigner('0x06601571aa9d3e8f5f7cdd5b993192618964bab5')

    ;[, , , , vaultController, userPermit] = await ethers.getSigners()
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

    pool = await ethers.getContractAt('ICurvePool', '0xdc24316b9ae028f1497c275eb9192a3ea0f67022')

    const ETHAdapter = await ethers.getContractFactory('ETHAdapter')
    adapter = await ETHAdapter.deploy(pool.address)

    // Give approval upfront that the vault can pull money from the investor contract
    await investor.approveVaultToPull(vault.address)

    await configuration.setParameter(vault.address, ethers.utils.formatBytes32String('VAULT_CONTROLLER'), vaultController.address)
    await configuration.setParameter(vault.address, ethers.utils.formatBytes32String('WITHDRAW_FEE_RATIO'), BigNumber.from('100'))

    await asset.connect(user0).approve(vault.address, ethers.constants.MaxUint256)
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

  it("cannot deploy with a pool that doesn't support ETH<>stETH", async () => {
    const pool = await ethers.getContractAt('ICurvePool', '0xD51a44d3FaE010294C616388b506AcdA1bfAAE46')
    const ETHAdapter = await ethers.getContractFactory('ETHAdapter')
    await expect(ETHAdapter.deploy(pool.address)).to.be.reverted
  })

  describe('zap in', () => {
    it('deposit', async () => {
      const assets = ethers.utils.parseEther('10')
      const minOutput = assets.add(assets.mul('1').div('100')) // 101%
      const actualAssets = await adapter.convertToSTETH(assets)
      const actualShares = await vault.convertToShares(actualAssets)

      expect(await asset.balanceOf(vault.address)).to.be.equal(0)

      const tx = adapter.connect(user0).deposit(vault.address, user0.address, minOutput, {
        value: assets
      })

      await expect(async () => await tx)
        .to.changeEtherBalances(
          [user0, pool],
          [minus(assets), assets]
        )

      expect(await asset.balanceOf(vault.address)).to.be.closeTo(actualAssets, 1)
      expect(await vault.idleAssetsOf(user0.address)).to.be.closeTo(actualAssets, 1)

      // Adapter shouldn't retain user assets
      expect(await asset.balanceOf(adapter.address)).to.be.equal(0)
      expect(await ethers.provider.getBalance(adapter.address)).to.be.equal(0)

      await vault.connect(vaultController).endRound()
      await vault.connect(vaultController).processQueuedDeposits(0, 1)
      await vault.connect(vaultController).startRound()

      expect(await vault.balanceOf(user0.address)).to.be.closeTo(actualShares, 1)
      expect(await vault.maxWithdraw(user0.address)).to.be.closeTo(feeExcluded(actualAssets), 1)
      expect(await vault.totalAssets()).to.be.closeTo(actualAssets, 1)
    })
  })

  describe('zap out', () => {
    it('withdraw', async () => {
      const assets = ethers.utils.parseEther('10')
      const actualAssets = await adapter.convertToSTETH(assets)
      const actualShares = await vault.convertToShares(actualAssets)

      await adapter.connect(user0).deposit(vault.address, user0.address, assets, {
        value: assets
      })

      await vault.connect(vaultController).endRound()
      await vault.connect(vaultController).processQueuedDeposits(0, 1)
      await vault.connect(vaultController).startRound()

      expect(await vault.balanceOf(user0.address)).to.be.closeTo(actualShares, 1)
      expect(await vault.maxWithdraw(user0.address)).to.be.closeTo(feeExcluded(actualAssets), 1)

      await vault.connect(user0).approve(adapter.address, actualShares)
      const expectedAssets = await vault.maxRedeem(user0.address)
      const expectedETH = await adapter.convertToETH(feeExcluded(expectedAssets.sub(1)))
      const withdrawTx = adapter.connect(user0).withdraw(
        vault.address,
        expectedAssets,
        user0.address,
        expectedETH
      )

      await expect(async () => await withdrawTx)
        .to.changeEtherBalances(
          [pool, user0],
          [minus(expectedETH), expectedETH]
        )

      expect(await vault.balanceOf(user0.address)).to.be.equal(0)
      expect(await asset.balanceOf(vault.address)).to.be.closeTo(BigNumber.from(0), 1)

      // Adapter shouldn't retain user assets
      expect(await asset.balanceOf(adapter.address)).to.be.closeTo(BigNumber.from(0), 1)
      expect(await ethers.provider.getBalance(adapter.address)).to.be.equal(0)
    })

    it('withdrawWithPermit', async () => {
      const assets = ethers.utils.parseEther('10')
      const actualAssets = await adapter.convertToSTETH(assets)
      const actualShares = (await vault.convertToShares(actualAssets)).sub(1)

      await asset.connect(user0).transfer(userPermit.address, assets)
      await adapter.connect(userPermit).deposit(vault.address, userPermit.address, assets, {
        value: assets
      })

      await vault.connect(vaultController).endRound()
      await vault.connect(vaultController).processQueuedDeposits(0, 1)
      await vault.connect(vaultController).startRound()

      expect(await vault.balanceOf(userPermit.address)).to.be.equal(actualShares)
      expect(await vault.maxWithdraw(userPermit.address)).to.be.closeTo(feeExcluded(actualAssets), 1)

      const expectedAssets = await vault.maxRedeem(userPermit.address)
      const expectedETH = await adapter.convertToETH(feeExcluded(expectedAssets.sub(1)))

      const permit = await signERC2612Permit(
        userPermit,
        {
          name: 'Pods Yield stETH',
          version: '1',
          chainId: hre.network.config.chainId as number,
          verifyingContract: vault.address
        },
        userPermit.address,
        adapter.address,
        actualShares.toString()
      )

      const withdrawTx = adapter.connect(userPermit).withdrawWithPermit(
        vault.address,
        expectedAssets,
        userPermit.address,
        expectedETH,
        permit.deadline,
        permit.v,
        permit.r,
        permit.s
      )

      await expect(async () => await withdrawTx)
        .to.changeEtherBalances(
          [pool, userPermit],
          [minus(expectedETH), expectedETH]
        )

      expect(await vault.balanceOf(userPermit.address)).to.be.equal(0)
      expect(await asset.balanceOf(vault.address)).to.be.closeTo(BigNumber.from(0), 1)

      // Adapter shouldn't retain user assets
      expect(await asset.balanceOf(adapter.address)).to.be.closeTo(BigNumber.from(0), 1)
      expect(await ethers.provider.getBalance(adapter.address)).to.be.equal(0)
    })

    it('redeem', async () => {
      const assets = ethers.utils.parseEther('10')
      const actualAssets = await adapter.convertToSTETH(assets)
      const actualShares = await vault.convertToShares(actualAssets)

      await adapter.connect(user0).deposit(vault.address, user0.address, assets, {
        value: assets
      })

      await vault.connect(vaultController).endRound()
      await vault.connect(vaultController).processQueuedDeposits(0, 1)
      await vault.connect(vaultController).startRound()

      expect(await vault.balanceOf(user0.address)).to.be.closeTo(actualShares, 1)
      expect(await vault.maxWithdraw(user0.address)).to.be.closeTo(feeExcluded(actualAssets), 1)

      await vault.connect(user0).approve(adapter.address, actualShares)
      const expectedAssets = await vault.maxRedeem(user0.address)
      const expectedETH = await adapter.convertToETH(feeExcluded(expectedAssets.sub(1)))
      const withdrawTx = adapter.connect(user0).redeem(
        vault.address,
        await vault.balanceOf(user0.address),
        user0.address,
        expectedETH
      )

      await expect(async () => await withdrawTx)
        .to.changeEtherBalances(
          [pool, user0],
          [minus(expectedETH), expectedETH]
        )

      expect(await vault.balanceOf(user0.address)).to.be.equal(0)
      expect(await asset.balanceOf(vault.address)).to.be.closeTo(BigNumber.from(0), 1)

      // Adapter shouldn't retain user assets
      expect(await asset.balanceOf(adapter.address)).to.be.closeTo(BigNumber.from(0), 1)
      expect(await ethers.provider.getBalance(adapter.address)).to.be.equal(0)
    })

    it('redeemWithPermit', async () => {
      const assets = ethers.utils.parseEther('10')
      const actualAssets = await adapter.convertToSTETH(assets)
      const actualShares = (await vault.convertToShares(actualAssets)).sub(1)
      await asset.connect(user0).transfer(userPermit.address, assets)

      await adapter.connect(userPermit).deposit(vault.address, userPermit.address, assets, {
        value: assets
      })

      await vault.connect(vaultController).endRound()
      await vault.connect(vaultController).processQueuedDeposits(0, 1)
      await vault.connect(vaultController).startRound()

      expect(await vault.balanceOf(userPermit.address)).to.be.closeTo(actualShares, 1)
      expect(await vault.maxWithdraw(userPermit.address)).to.be.closeTo(feeExcluded(actualAssets), 1)

      const expectedAssets = await vault.maxRedeem(userPermit.address)
      const expectedETH = await adapter.convertToETH(feeExcluded(expectedAssets.sub(1)))

      const permit = await signERC2612Permit(
        userPermit,
        {
          name: 'Pods Yield stETH',
          version: '1',
          chainId: hre.network.config.chainId as number,
          verifyingContract: vault.address
        },
        userPermit.address,
        adapter.address,
        actualShares.toString()
      )

      const redeemTx = adapter.connect(userPermit).redeemWithPermit(
        vault.address,
        actualShares,
        userPermit.address,
        expectedETH,
        permit.deadline,
        permit.v,
        permit.r,
        permit.s
      )

      await expect(async () => await redeemTx)
        .to.changeEtherBalances(
          [pool, userPermit],
          [minus(expectedETH), expectedETH]
        )

      expect(await vault.balanceOf(userPermit.address)).to.be.equal(0)
      expect(await asset.balanceOf(vault.address)).to.be.closeTo(BigNumber.from(0), 1)

      // Adapter shouldn't retain user assets
      expect(await asset.balanceOf(adapter.address)).to.be.closeTo(BigNumber.from(0), 1)
      expect(await ethers.provider.getBalance(adapter.address)).to.be.equal(0)
    })
  })
})
