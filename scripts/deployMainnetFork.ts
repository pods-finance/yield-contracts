import { ethers } from 'hardhat'
import { BigNumber } from 'ethers'

async function main (): Promise<void> {
  const [deployer] = await ethers.getSigners()

  // const gasPrice = ''
  const stETHAddress = '0xae7ab96520de3a18e5e111b5eaab095312d7fe84'

  const ConfigurationManager = await ethers.getContractFactory('ConfigurationManager')
  const configurationManager = await ConfigurationManager.deploy()
  console.log(`\nConfigurationManager deployed at: ${configurationManager.address}\n`)

  const InvestorActorMock = await ethers.getContractFactory('InvestorActorMock')
  const investor = await InvestorActorMock.deploy(stETHAddress)
  console.log(`\nInvestor deployed at: ${investor.address}\n`)

  const Vault = await ethers.getContractFactory('STETHVault')
  const vaultConstructorArguments = [
    configurationManager.address,
    stETHAddress,
    investor.address
  ] as const

  const vault = await Vault.deploy(...vaultConstructorArguments)
  console.log(`\nVault deployed at: ${vault.address}\n`)

  await configurationManager.setParameter(
    vault.address,
    ethers.utils.formatBytes32String('VAULT_CONTROLLER'),
    deployer.address
  )
  await configurationManager.setParameter(
    vault.address,
    ethers.utils.formatBytes32String('WITHDRAW_FEE_RATIO'),
    BigNumber.from('100')
  )

  await investor.approveVaultToPull(vault.address)

  console.table({
    ConfigurationManager: configurationManager.address,
    InvestorActorMock: investor.address,
    Vault: vault.address
  })
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
