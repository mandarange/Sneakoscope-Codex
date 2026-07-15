import { runNativeCliWorkerFromArgs } from './native-cli-worker.js'

runNativeCliWorkerFromArgs(process.argv.slice(2)).catch((error: unknown) => {
  const message = error instanceof Error && error.stack ? error.stack : String(error)
  process.stderr.write(`${message}\n`)
  process.exitCode = 1
})
