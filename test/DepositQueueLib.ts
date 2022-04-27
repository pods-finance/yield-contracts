import { Contract } from '@ethersproject/contracts'
import { BigNumber, Signer } from 'ethers'
import { ethers } from 'hardhat'
import { expect } from 'chai'

describe('DepositQueueLib', () => {
  let queue: Contract
  let user0: Signer, user1: Signer
  let snapshotId: BigNumber

  before(async () => {
    [, user0, user1] = await ethers.getSigners()
    const DepositQueueLib = await ethers.getContractFactory('DepositQueueLib')
    const depositQueueLib = await DepositQueueLib.deploy()
    const DepositQueueMock = await ethers.getContractFactory('DepositQueueMock', {
      libraries: {
        DepositQueueLib: depositQueueLib.address
      }
    })
    queue = await DepositQueueMock.deploy()
  })

  beforeEach(async () => {
    snapshotId = await ethers.provider.send('evm_snapshot', [])
  })

  afterEach(async () => {
    await ethers.provider.send('evm_revert', [snapshotId])
  })

  it('adds the user to the queue', async () => {
    let deposit
    expect(await queue.size()).to.be.equal(0)

    await queue.connect(user0).push(1)
    expect(await queue.size()).to.be.equal(1)
    deposit = await queue.get(0)
    expect(deposit.owner).to.be.equal(await user0.getAddress())
    expect(deposit.amount).to.be.equal(1)
    expect(await queue.balanceOf(await user0.getAddress())).to.be.equal(1)

    await queue.connect(user1).push(10)
    expect(await queue.size()).to.be.equal(2)
    deposit = await queue.get(1)
    expect(deposit.owner).to.be.equal(await user1.getAddress())
    expect(deposit.amount).to.be.equal(10)
    expect(await queue.balanceOf(await user1.getAddress())).to.be.equal(10)
  })

  it('re-adds the user to the queue', async () => {
    let deposit
    expect(await queue.size()).to.be.equal(0)

    await queue.connect(user0).push(1)
    expect(await queue.size()).to.be.equal(1)
    deposit = await queue.get(0)
    expect(deposit.owner).to.be.equal(await user0.getAddress())
    expect(deposit.amount).to.be.equal(1)
    expect(await queue.balanceOf(await user0.getAddress())).to.be.equal(1)

    await queue.connect(user0).push(3)
    expect(await queue.size()).to.be.equal(1)
    deposit = await queue.get(0)
    expect(deposit.owner).to.be.equal(await user0.getAddress())
    expect(deposit.amount).to.be.equal(4)
    expect(await queue.balanceOf(await user0.getAddress())).to.be.equal(4)
  })

  it('removes users from the queue and reorganize queue', async () => {
    let deposit
    expect(await queue.size()).to.be.equal(0)

    await queue.connect(user0).push(42)
    await queue.connect(user1).push(160)
    expect(await queue.size()).to.be.equal(2)

    await queue.remove(0, 1)
    deposit = await queue.get(0)
    expect(deposit.owner).to.be.equal(await user1.getAddress())
    expect(deposit.amount).to.be.equal(160)
    expect(await queue.size()).to.be.equal(1)

    await queue.connect(user0).push(42)
    await queue.remove(0, await queue.size())
    expect(await queue.size()).to.be.equal(0)
  })
})
