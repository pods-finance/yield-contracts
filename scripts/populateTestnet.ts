// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through 'node <script>'.
//
// When running the script with 'npx hardhat run <script>' you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers } from 'hardhat'

const WAIT_CONFIRMATIONS = 5

async function main (): Promise<void> {
  const vaultAddress = process.env.VAULT ?? '0x3B4bBe9c0A48AD148c5C54221c66DEE42668Cfef'
  if (!ethers.utils.isAddress(vaultAddress)) {
    throw new Error('Invalid vault address')
  }

  const [,user0, user1] = await ethers.getSigners()
  const vault = await ethers.getContractAt('PrincipalProtectedMock', vaultAddress)
  const asset = await ethers.getContractAt('Asset', await vault.asset())

  await (await asset.connect(user0).mint(ethers.utils.parseEther('250'))).wait(WAIT_CONFIRMATIONS)
  await (await asset.connect(user0).approve(vault.address, ethers.constants.MaxUint256)).wait(WAIT_CONFIRMATIONS)
  await (await vault.connect(user0).deposit(ethers.utils.parseEther('250'), user0.address)).wait(WAIT_CONFIRMATIONS)
  console.log('User0 Deposited')

  await (await asset.connect(user1).mint(ethers.utils.parseEther('100'))).wait(WAIT_CONFIRMATIONS)
  await (await asset.connect(user1).approve(vault.address, ethers.constants.MaxUint256)).wait(WAIT_CONFIRMATIONS)
  await (await vault.connect(user1).deposit(ethers.utils.parseEther('100'), user1.address)).wait(WAIT_CONFIRMATIONS)
  console.log('User1 Deposited')

  await (await vault.endRound()).wait(WAIT_CONFIRMATIONS)
  console.log('Round Ended')
  await (await vault.processQueuedDeposits(0, 2)).wait(WAIT_CONFIRMATIONS)
  console.log('Payments processed')
  await (await vault.startRound()).wait(WAIT_CONFIRMATIONS)
  console.log('Round Started')

  await (await vault.connect(user0).withdraw(user0.address)).wait(WAIT_CONFIRMATIONS)
  console.log('User0 Withdrew')
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
