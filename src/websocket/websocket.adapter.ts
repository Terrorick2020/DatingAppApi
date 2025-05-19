import { INestApplicationContext } from '@nestjs/common'
import { IoAdapter } from '@nestjs/platform-socket.io'
import { ServerOptions } from 'socket.io'
import { ConfigService } from '@nestjs/config'
import Redis from 'ioredis'
import { Logger } from '@nestjs/common'
import { createAdapter } from '@socket.io/redis-adapter' // Теперь это должно работать

export class WebsocketAdapter extends IoAdapter {
	private readonly logger = new Logger(WebsocketAdapter.name)
	private readonly configService: ConfigService

	constructor(
		appOrHttpServer: INestApplicationContext,
		configService: ConfigService
	) {
		super(appOrHttpServer)
		this.configService = configService
	}

	createIOServer(port: number, options?: ServerOptions): any {
		const server = super.createIOServer(port, {
			...options,
			cors: {
				origin: '*',
				methods: ['GET', 'POST'],
				credentials: true,
			},
			transports: ['websocket', 'polling'],
			pingInterval: 25000,
			pingTimeout: 10000,
			connectTimeout: 10000,
			maxHttpBufferSize: 1e6, // 1 MB
		})

		// Настройка адаптера для Redis
		try {
			const host = this.configService.get('REDIS_HOST', 'localhost')
			const redisPort = parseInt(this.configService.get('REDIS_PORT', '6379'))
			const password = this.configService.get('REDIS_PASSWORD', '')

			const pubClient = new Redis({
				host,
				port: redisPort,
				password,
			})

			const subClient = pubClient.duplicate()

			// Создание адаптера для Redis
			const redisAdapter = createAdapter(pubClient, subClient, {
				key: 'socket.io',
			})

			server.adapter(redisAdapter)
			this.logger.log('WebSocket адаптер с Redis успешно настроен')
		} catch (error: any) {
			this.logger.error(`Ошибка настройки Redis адаптера: ${error.message}`)
		}

		return server
	}
}
