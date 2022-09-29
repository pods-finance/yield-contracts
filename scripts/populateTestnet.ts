// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through 'node <script>'.
//
// When running the script with 'npx hardhat run <script>' you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers } from 'hardhat'

const WAIT_CONFIRMATIONS = 3

async function main (): Promise<void> {
  const vaultAddress = process.env.VAULT ?? '0x8497CcEE4426e4e2A33a97D7C577Ce8709923E69'
  if (!ethers.utils.isAddress(vaultAddress)) {
    throw new Error('Invalid vault address')
  }

  const [,user0, user1] = await ethers.getSigners()
  const vault = await ethers.getContractAt('STETHVault', vaultAddress)
  const asset = await ethers.getContractAt('Asset', await vault.asset())

  await (await asset.connect(user0).mint(ethers.utils.parseEther('2'))).wait(WAIT_CONFIRMATIONS)
  console.log('User0 Minted')
  await (await asset.connect(user0).approve(vault.address, ethers.constants.MaxUint256)).wait(WAIT_CONFIRMATIONS)
  console.log('User0 Approve')
  await (await vault.connect(user0).deposit(ethers.utils.parseEther('2'), user0.address)).wait(WAIT_CONFIRMATIONS)
  console.log('User0 Deposited')

  await (await asset.connect(user1).mint(ethers.utils.parseEther('0.5'))).wait(WAIT_CONFIRMATIONS)
  console.log('User1 Minted')

  await (await asset.connect(user1).approve(vault.address, ethers.constants.MaxUint256)).wait(WAIT_CONFIRMATIONS)
  console.log('User1 Approved')

  await (await vault.connect(user1).deposit(ethers.utils.parseEther('0.5'), user1.address)).wait(WAIT_CONFIRMATIONS)
  console.log('User1 Deposited')

  await (await vault.endRound()).wait(WAIT_CONFIRMATIONS)
  console.log('Round 0 Ended')
  await (await vault.processQueuedDeposits(0, 2)).wait(WAIT_CONFIRMATIONS)
  console.log('Payments processed')
  await (await vault.startRound()).wait(WAIT_CONFIRMATIONS)
  console.log('Round 1 Started')

  await (await asset.connect(user0).mint(ethers.utils.parseEther('1'))).wait(WAIT_CONFIRMATIONS)
  console.log('User0 Minted')
  await (await asset.connect(user0).transfer(vault.address, ethers.utils.parseEther('0.9'))).wait(WAIT_CONFIRMATIONS)
  console.log('User0 Transferred')

  await (await vault.endRound()).wait(WAIT_CONFIRMATIONS)
  console.log('Round 1 Ended')

  await (await vault.startRound()).wait(WAIT_CONFIRMATIONS)
  console.log('Round 2 Started')

  await (await vault.connect(user0).redeem(await vault.balanceOf(user0.address), user0.address, user0.address)).wait(WAIT_CONFIRMATIONS)
  console.log('User0 Withdrew')
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
