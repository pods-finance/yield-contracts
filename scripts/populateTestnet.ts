// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through 'node <script>'.
//
// When running the script with 'npx hardhat run <script>' you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers } from 'hardhat'

const WAIT_CONFIRMATIONS = 5

async function main (): Promise<void> {
  const vaultAddress = process.env.VAULT ?? ''
  if (!ethers.utils.isAddress(vaultAddress)) {
    throw new Error('Invalid vault address')
  }

  const [,user0, user1] = await ethers.getSigners()
  const vault = await ethers.getContractAt('PrincipalProtectedMock', vaultAddress)
  const asset = await ethers.getContractAt('Asset', await vault.asset())

  /* eslint-disable @typescript-eslint/no-floating-promises */
  ;(await asset.connect(user0).mint(ethers.utils.parseEther('250'))).wait(WAIT_CONFIRMATIONS)
  ;(await asset.connect(user0).approve(vault.address, ethers.constants.MaxUint256)).wait(WAIT_CONFIRMATIONS)
  ;(await vault.connect(user0).deposit(ethers.utils.parseEther('250'))).wait(WAIT_CONFIRMATIONS)
  console.log('User0 Deposited')

  ;(await asset.connect(user1).mint(ethers.utils.parseEther('100'))).wait(WAIT_CONFIRMATIONS)
  ;(await asset.connect(user1).approve(vault.address, ethers.constants.MaxUint256)).wait(WAIT_CONFIRMATIONS)
  ;(await vault.connect(user1).deposit(ethers.utils.parseEther('100'))).wait(WAIT_CONFIRMATIONS)
  console.log('User1 Deposited')

  ;(await vault.endRound()).wait(WAIT_CONFIRMATIONS)
  console.log('Round Ended')
  ;(await vault.processQueuedDeposits(0, 2)).wait(WAIT_CONFIRMATIONS)
  console.log('Payments processed')
  ;(await vault.startRound()).wait(WAIT_CONFIRMATIONS)
  console.log('Round Started')

  ;(await vault.connect(user0).withdraw()).wait(WAIT_CONFIRMATIONS)
  console.log('User0 Withdrew')
  /* eslint-enable @typescript-eslint/no-floating-promises */
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
