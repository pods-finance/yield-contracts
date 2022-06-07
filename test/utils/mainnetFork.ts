import hre from 'hardhat'

export async function startMainnetFork (): Promise<void> {
  await hre.network.provider.request({
    method: 'hardhat_reset',
    params: [
      {
        forking: {
          jsonRpcUrl: process.env.ALCHEMY_MAINNET_URL ?? '',
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
