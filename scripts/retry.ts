type ExecutionCallback = (attempt: number) => any
type OnErrorCallback = (e: any) => boolean

export default async function retry (callback: ExecutionCallback, times: number = 1, onError: OnErrorCallback): Promise<any> {
  let result; let attempt = 1

  while (attempt <= times) {
    try {
      result = await callback(attempt)
      break
    } catch (e: any) {
      // If `onError` returns false, then break the loop
      if (!onError(e)) {
        break
      }

      console.error(`Attempt ${attempt} failed! ${attempt + 1 <= times ? 'Giving another try...' : 'Skipping function'}`)
      console.error(e)
    }
    attempt++
  }

  return result
}
