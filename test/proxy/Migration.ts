import { expect } from 'chai'
import hre, { ethers } from 'hardhat'
import { BigNumber } from 'ethers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { startMainnetFork, stopMainnetFork } from '../utils/mainnetFork'
import createConfigurationManager from '../utils/createConfigurationManager'
import { ConfigurationManager, ERC20, InvestorActorMock, Migration, STETHVault } from '../../typechain'
import { signERC2612Permit } from 'eth-permit'

describe('Migration', () => {
  let asset: ERC20, vaultFrom: STETHVault, vaultTo: STETHVault, investor: InvestorActorMock,
    configuration: ConfigurationManager, migration: Migration

  let user0: SignerWithAddress, user1: SignerWithAddress, user2: SignerWithAddress, vaultController: SignerWithAddress,
    userPermit: SignerWithAddress

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

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: ['0x0c67f4ffc902140c972ecab356c9993e6ce8caf3']
    })

    user2 = await ethers.getSigner('0x0c67f4ffc902140c972ecab356c9993e6ce8caf3')

    ;[, , , , vaultController, userPermit] = await ethers.getSigners()
    configuration = await createConfigurationManager()

    // Lido's stEth
    asset = await ethers.getContractAt('ERC20', '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84')

    const InvestorActorMock = await ethers.getContractFactory('InvestorActorMock')
    investor = await InvestorActorMock.deploy(asset.address)

    const STETHVault = await ethers.getContractFactory('STETHVault')
    vaultFrom = await STETHVault.deploy(
      configuration.address,
      asset.address,
      investor.address
    )

    vaultTo = await STETHVault.deploy(
      configuration.address,
      asset.address,
      investor.address
    )

    const Migration = await ethers.getContractFactory('Migration')
    migration = await Migration.deploy(vaultFrom.address, vaultTo.address)

    // Give approval upfront that the vault can pull money from the investor contract
    await investor.approveVaultToPull(vaultFrom.address)
    await investor.approveVaultToPull(vaultTo.address)

    await configuration.setParameter(vaultFrom.address, ethers.utils.formatBytes32String('VAULT_CONTROLLER'), vaultController.address)
    await configuration.setParameter(vaultFrom.address, ethers.utils.formatBytes32String('WITHDRAW_FEE_RATIO'), 0)

    await configuration.setParameter(vaultTo.address, ethers.utils.formatBytes32String('VAULT_CONTROLLER'), vaultController.address)
    await configuration.setParameter(vaultTo.address, ethers.utils.formatBytes32String('WITHDRAW_FEE_RATIO'), BigNumber.from('100'))

    await asset.connect(user0).approve(vaultFrom.address, ethers.constants.MaxUint256)
    await asset.connect(user1).approve(vaultFrom.address, ethers.constants.MaxUint256)
    await asset.connect(user2).approve(vaultTo.address, ethers.constants.MaxUint256)
    await asset.connect(vaultController).approve(vaultFrom.address, ethers.constants.MaxUint256)
    await asset.connect(vaultController).approve(vaultTo.address, ethers.constants.MaxUint256)
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

  it('migrates assets from one vault to the other', async () => {
    const assets = ethers.utils.parseEther('100')
    const user0Deposit = assets.mul(2)
    const user1Deposit = assets
    const user2Deposit = assets

    // Setup vault `from`
    await vaultFrom.connect(user0).deposit(user0Deposit, user0.address)
    await vaultFrom.connect(user1).deposit(user1Deposit, user1.address)
    await vaultFrom.connect(vaultController).endRound()
    await vaultFrom.connect(vaultController).processQueuedDeposits(0, await vaultFrom.depositQueueSize())
    await vaultFrom.connect(vaultController).startRound()

    // Setup vault `to`
    await vaultTo.connect(user2).deposit(user2Deposit, user2.address)
    await vaultTo.connect(vaultController).endRound()
    await vaultTo.connect(vaultController).processQueuedDeposits(0, await vaultTo.depositQueueSize())
    await vaultTo.connect(vaultController).startRound()

    const vaultFromTotalAssets = await vaultFrom.totalAssets()
    const vaultToTotalAssets = await vaultTo.totalAssets()
    const user1Withdrawable = await vaultFrom.maxWithdraw(user1.address)

    // Execute migration
    await vaultFrom.connect(user1).approve(migration.address, ethers.constants.MaxUint256)
    await migration.connect(user1).migrate()

    expect(await vaultFrom.totalAssets()).to.be.closeTo(vaultFromTotalAssets.sub(user1Withdrawable), 1)
    expect(await asset.balanceOf(migration.address)).to.be.closeTo(BigNumber.from('0'), 1)
    expect(await asset.balanceOf(vaultTo.address)).to.be.closeTo(vaultToTotalAssets.add(user1Withdrawable), 2)
    expect(await vaultTo.idleAssetsOf(user1.address)).to.be.closeTo(user1Deposit, 3)
  })

  it('migrates assets from one vault to the other with permit', async () => {
    const userDeposit = ethers.utils.parseEther('100')
    await asset.connect(user0).transfer(userPermit.address, userDeposit)
    await asset.connect(userPermit).approve(vaultFrom.address, userDeposit)

    await vaultFrom.connect(userPermit).deposit(userDeposit, userPermit.address)
    await vaultFrom.connect(vaultController).endRound()
    await vaultFrom.connect(vaultController).processQueuedDeposits(0, await vaultFrom.depositQueueSize())
    await vaultFrom.connect(vaultController).startRound()

    // Execute migration
    const shares = await vaultFrom.balanceOf(userPermit.address)
    const permit = await signERC2612Permit(
      userPermit,
      {
        name: 'Pods Yield stETH',
        version: '1',
        chainId: hre.network.config.chainId as number,
        verifyingContract: vaultFrom.address
      },
      userPermit.address,
      migration.address,
      shares.toString()
    )
    await migration.connect(userPermit).migrateWithPermit(
      permit.deadline,
      permit.v,
      permit.r,
      permit.s
    )
  })

  it('cannot migrate between vaults with different assets', async () => {
    const Asset = await ethers.getContractFactory('Asset')
    const asset = await Asset.deploy('Asset', 'AST')
    const STETHVault = await ethers.getContractFactory('STETHVault')
    vaultTo = await STETHVault.deploy(configuration.address, asset.address, investor.address)

    const Migration = await ethers.getContractFactory('Migration')
    await expect(Migration.deploy(vaultFrom.address, vaultTo.address))
      .to.be.revertedWith('Vault assets must be the same')
  })
})
