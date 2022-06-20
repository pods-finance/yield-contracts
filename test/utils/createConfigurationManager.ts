import { ethers } from 'hardhat'
import { ConfigurationManager } from '../../typechain'

interface ConfigurationManagerParameters {
  blank?: string
}

export default async function createConfigurationManager (params: ConfigurationManagerParameters = {}): Promise<ConfigurationManager> {
  const ConfigurationManager = await ethers.getContractFactory('ConfigurationManager')
  const configuration = await ConfigurationManager.deploy()

  return configuration
}
