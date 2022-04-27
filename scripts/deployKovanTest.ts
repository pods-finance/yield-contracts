// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers } from 'hardhat'

async function main (): Promise<void> {
  let deployer
  ;[deployer] = await ethers.getSigners()
  const deployerAddress = await deployer.getAddress()

  // 1) Deploy Mock Underlying
  // 2) Deploy Mock Yield Source
  // 3) Deploy Principal Protected ETH Bull

  const Asset = await ethers.getContractFactory('Asset')
  const asset = await Asset.deploy()
  await asset.deployed()

  const DepositQueueLib = await ethers.getContractFactory('DepositQueueLib')
  const depositQueueLib = await DepositQueueLib.deploy()
  await depositQueueLib.deployed()

  const YieldSource = await ethers.getContractFactory('YieldSourceMock')
  const yieldSource = await YieldSource.deploy(asset.address)
  await yieldSource.deployed()

  const PrincipalProtected = await ethers.getContractFactory('PrincipalProtectedETHBull', { libraries: {
    DepositQueueLib: depositQueueLib.address
  }})
  const principalProtected = await PrincipalProtected.deploy(asset.address, deployerAddress, deployerAddress, yieldSource.address)
  await principalProtected.deployed()

  console.log('Asset:', asset.address)
  console.log('yieldSource:', yieldSource.address)
  console.log('principalProtected:', principalProtected.address)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
