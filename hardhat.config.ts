import * as dotenv from 'dotenv'

import { HardhatUserConfig } from 'hardhat/config'
import '@nomiclabs/hardhat-etherscan'
import '@nomiclabs/hardhat-waffle'
import '@typechain/hardhat'
import 'hardhat-gas-reporter'
import 'hardhat-abi-exporter'
import 'solidity-coverage'

dotenv.config()

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

const config: HardhatUserConfig = {
  solidity: '0.8.8',
  networks: {
    kovan: {
      url: 'https://kovan.infura.io/v3/' + process.env.INFURA_PROJECT_ID,
      accounts: {
        mnemonic: process.env.DEV_MNEMONIC || ''
      }
    },
    hardhat: {
      forking: {
        url: process.env.ALCHEMY_MAINNET_URL || '',
        enabled: process.env.MAINNET_FORK === 'true',
      },
      accounts: {
        mnemonic: process.env.DEV_MNEMONIC || ''
      }
    }
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: 'USD'
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY
  },
  abiExporter: {
    runOnCompile: true,
    clear: true,
    flat: true,
    pretty: true,
    only: [
      'BaseVault',
      'PrincipalProtectedETHBull'
    ]
  }
}

export default config
