import { Contract } from '@ethersproject/contracts'
import { BigNumber } from 'ethers'
import { ethers } from 'hardhat'
import { expect } from 'chai'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'

describe('DepositQueueLib', () => {
  let queue: Contract
  let user0: SignerWithAddress, user1: SignerWithAddress
  let snapshotId: BigNumber

  before(async () => {
    [, user0, user1] = await ethers.getSigners()
    const DepositQueueMock = await ethers.getContractFactory('DepositQueueMock')
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
    expect(deposit.owner).to.be.equal(user0.address)
    expect(deposit.amount).to.be.equal(1)
    expect(await queue.balanceOf(user0.address)).to.be.equal(1)
    expect(await queue.totalDeposited()).to.be.equal(1)

    await queue.connect(user1).push(10)
    expect(await queue.size()).to.be.equal(2)
    deposit = await queue.get(1)
    expect(deposit.owner).to.be.equal(user1.address)
    expect(deposit.amount).to.be.equal(10)
    expect(await queue.balanceOf(user1.address)).to.be.equal(10)
    expect(await queue.totalDeposited()).to.be.equal(11)
  })

  it('re-adds the user to the queue', async () => {
    let deposit
    expect(await queue.size()).to.be.equal(0)

    await queue.connect(user0).push(1)
    expect(await queue.size()).to.be.equal(1)
    deposit = await queue.get(0)
    expect(deposit.owner).to.be.equal(user0.address)
    expect(deposit.amount).to.be.equal(1)
    expect(await queue.balanceOf(user0.address)).to.be.equal(1)
    expect(await queue.totalDeposited()).to.be.equal(1)

    await queue.connect(user0).push(3)
    expect(await queue.size()).to.be.equal(1)
    deposit = await queue.get(0)
    expect(deposit.owner).to.be.equal(user0.address)
    expect(deposit.amount).to.be.equal(4)
    expect(await queue.balanceOf(user0.address)).to.be.equal(4)
    expect(await queue.totalDeposited()).to.be.equal(4)
  })

  it('removes users from the queue and reorganize queue', async () => {
    expect(await queue.size()).to.be.equal(0)

    await queue.connect(user0).push(42)
    await queue.connect(user1).push(160)
    expect(await queue.size()).to.be.equal(2)
    expect(await queue.totalDeposited()).to.be.equal(202)

    await queue.remove(0, 1)
    const deposit = await queue.get(0)
    expect(deposit.owner).to.be.equal(user1.address)
    expect(deposit.amount).to.be.equal(160)
    expect(await queue.size()).to.be.equal(1)
    expect(await queue.totalDeposited()).to.be.equal(160)

    await queue.connect(user0).push(42)
    await queue.remove(0, await queue.size())
    expect(await queue.size()).to.be.equal(0)
    expect(await queue.totalDeposited()).to.be.equal(0)
  })

  it('will not remove if startIndex >= endIndex', async () => {
    expect(await queue.size()).to.be.equal(0)

    await queue.connect(user0).push(42)
    await queue.connect(user1).push(160)
    expect(await queue.size()).to.be.equal(2)
    expect(await queue.totalDeposited()).to.be.equal(202)

    await queue.remove(1, 1)
    expect(await queue.size()).to.be.equal(2)
    expect(await queue.totalDeposited()).to.be.equal(202)

    await queue.remove(2, 1)
    expect(await queue.size()).to.be.equal(2)
    expect(await queue.totalDeposited()).to.be.equal(202)
  })
})
