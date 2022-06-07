import hre from 'hardhat'

export async function startMainnetFork (): Promise<void> {
  await hre.network.provider.request({
    method: 'hardhat_reset',
    params: [
      {
        forking: {
          jsonRpcUrl: `https://mainnet.infura.io/v3/${process.env.INFURA_PROJECT_ID ?? ''}`,
          blockNumber: parseInt(process.env.MAINNET_FORK_BLOCKNUMBER ?? '14899831')
        }
      }
    ]
  })
}

export async function stopMainnetFork (): Promise<void> {
  await hre.network.provider.request({
    method: 'hardhat_reset',
    params: []
  })
}
