PS C:\Users\Cody\Downloads\PortableGit\Lockbox> pnpm dev
$ turbo run dev dev:worker

   • turbo 2.11.10
   • Packages in scope: @repo/api, @repo/crypto, @repo/types, @repo/web
   • Running dev, dev:worker in 4 packages
   • Remote caching disabled

@repo/api:db:generate: cache bypass, force executing 510313577ae72d4a
@repo/web:dev: cache bypass, force executing aff215833381129e
@repo/api:db:generate: $ prisma generate
@repo/web:dev: $ vite
@repo/web:dev: 
@repo/web:dev:   VITE v8.3.5  ready in 431 ms
@repo/web:dev:
@repo/web:dev:   ➜  Local:   http://localhost:5173/
@repo/web:dev:   ➜  Network: use --host to expose
@repo/api:db:generate: Loaded Prisma config from prisma.config.ts.
@repo/api:db:generate:
@repo/web:dev: 11:08:07 PM [vite] http proxy error: /health/ready
@repo/web:dev: Error: connect ECONNREFUSED 127.0.0.1:3000
@repo/web:dev:     at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1706:16)        
@repo/api:db:generate: Prisma schema loaded from prisma\schema.prisma.
@repo/api:db:generate: 
@repo/api:db:generate: ✔ Generated Prisma Client (7.10.1) to .\src\generated\prisma in 36ms 
@repo/api:db:generate:
@repo/api:dev: cache bypass, force executing 33123443690958d0
@repo/api:dev:worker: cache bypass, force executing bdf15cbdc89daade
@repo/api:dev: $ node --watch --watch-preserve-output --import tsx src/server.ts
@repo/api:dev:worker: $ node --watch --watch-preserve-output --import tsx src/worker.ts
@repo/api:dev: 
@repo/api:dev: C:\Users\Cody\Downloads\PortableGit\Lockbox\node_modules\.pnpm\fastify@5.12.7\node_modules\fastify\lib\logger-factory.js:142
@repo/api:dev:   throw new FST_ERR_LOG_INVALID_LOG_CONTROLLER(typeof userController)        
@repo/api:dev:         ^
@repo/api:dev: FastifyError: logController option must be an instance of LogController, got 'object'.
@repo/api:dev:     at createLogController (C:\Users\Cody\Downloads\PortableGit\Lockbox\node_modules\.pnpm\fastify@5.12.7\node_modules\fastify\lib\logger-factory.js:142:9)
@repo/api:dev:     at processOptions (C:\Users\Cody\Downloads\PortableGit\Lockbox\node_modules\.pnpm\fastify@5.12.7\node_modules\fastify\fastify.js:908:25)
@repo/api:dev:     at fastify (C:\Users\Cody\Downloads\PortableGit\Lockbox\node_modules\.pnpm\fastify@5.12.7\node_modules\fastify\fastify.js:97:7)
@repo/api:dev:     at buildApp (C:\Users\Cody\Downloads\PortableGit\Lockbox\apps\api\src\app.ts:23:15)
@repo/api:dev:     at <anonymous> (C:\Users\Cody\Downloads\PortableGit\Lockbox\apps\api\src\server.ts:16:19)
@repo/api:dev:     at ModuleJob.run (node:internal/modules/esm/module_job:439:25)
@repo/api:dev:     at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
@repo/api:dev:     at async node:internal/modules/esm/loader:643:26
@repo/api:dev:     at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:101:5) {
@repo/api:dev:   code: 'FST_ERR_LOG_INVALID_LOG_CONTROLLER',
@repo/api:dev:   statusCode: 500
@repo/api:dev: }
@repo/api:dev:
@repo/api:dev: Node.js v24.18.0
@repo/api:dev:worker: [23:08:08] INFO (worker): worker started
@repo/api:dev:worker:     queues: [
@repo/api:dev:worker:       "maintenance"
@repo/api:dev:worker:     ]
@repo/api:dev: Failed running 'src/server.ts'. Waiting for file changes before restarting.