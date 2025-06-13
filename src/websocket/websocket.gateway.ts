import {
	WebSocketGateway,
	OnGatewayConnection,
	OnGatewayDisconnect,
	OnGatewayInit,
	WebSocketServer,
} from '@nestjs/websockets'
import { Logger } from '@nestjs/common'
import { Server, Socket } from 'socket.io'
import { WebSocketService } from './websocket.service'
import { RedisPubSubService } from '../common/redis-pub-sub/redis-pub-sub.service'

@WebSocketGateway({
	cors: {
		origin: '*',
		methods: ['GET', 'POST'],
		credentials: true,
	},
	namespace: 'api',
})
export class WebsocketGateway
	implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit
{
	@WebSocketServer() server: Server
	private readonly logger = new Logger(WebsocketGateway.name)

	constructor(
		private readonly websocketService: WebSocketService,
		private readonly redisPubSub: RedisPubSubService
	) {}

	afterInit(server: Server) {
		this.logger.log('WebSocket Gateway инициализирован')
		this.websocketService.setServer(server)
	}

	handleConnection(client: Socket) {
		const userId = client.handshake.query.telegramId as string
		if (userId) {
			client.join(userId) // Присоединяем клиента к его личной комнате
			this.logger.log(`Клиент ${userId} подключен, socketId: ${client.id}`)
			console.log('------------')
			console.log(`Клиент ${userId} подключен, socketId: ${client.id}`)
			// Обновляем статус пользователя на "онлайн"
			this.redisPubSub.publishUserStatus({
				userId,
				status: 'online',
				notifyUsers: [],
				timestamp: Date.now(),
			})
		}
	}

	handleDisconnect(client: Socket) {
		const userId = client.handshake.query.telegramId as string
		if (userId) {
			this.logger.log(`Клиент ${userId} отключен, socketId: ${client.id}`)

			// Обновляем статус пользователя на "оффлайн"
			this.redisPubSub.publishUserStatus({
				userId,
				status: 'offline',
				notifyUsers: [],
				timestamp: Date.now(),
			})
		}
	}
}
