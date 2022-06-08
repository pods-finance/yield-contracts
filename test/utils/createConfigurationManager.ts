import { ethers } from 'hardhat'
import { ConfigurationManager } from '../../typechain'

export default async function createConfigurationManager (): Promise<ConfigurationManager> {
  const ConfigurationManager = await ethers.getContractFactory('ConfigurationManager')
  const configuration = await ConfigurationManager.deploy()

  return configuration
}
