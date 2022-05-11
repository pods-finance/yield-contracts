import retry from './retry'

export default async function verify (hre: any, address: string, constructorArguments: any = [], libraries?: Object) {
  console.log('--Starting Verify Process--')
  const verifyData = {
    address,
    constructorArguments,
    libraries
  }

  if (libraries) {
    verifyData.libraries = libraries
  }

  await retry(() => hre.run('verify:verify', verifyData), 3, (error: any) => {
    const message = error.message.match(/Reason: (.*)/m)
    if (message === null || message.length < 2) {
      return true
    }
    const reason = message[1]
    const isVerified = reason === 'Already Verified'
    if (isVerified) {
      console.log(error.message)
    }
    return !isVerified
  })
}
