import {
	WebSocketGateway,
	SubscribeMessage,
	MessageBody,
	ConnectedSocket,
} from '@nestjs/websockets'
import { Socket } from 'socket.io'
import { LikeService } from './like.service'
import { AppLogger } from '../common/logger/logger.service'
import { RedisPubSubService } from '../common/redis-pub-sub/redis-pub-sub.service'

@WebSocketGateway({
	namespace: 'likes',
	cors: {
		origin: '*',
	},
})
export class LikeGateway {
	constructor(
		private readonly likeService: LikeService,
		private readonly logger: AppLogger,
		private readonly redisPubSub: RedisPubSubService
	) {}

	@SubscribeMessage('create_like')
	async handleCreateLike(
		@MessageBody() data: { fromUserId: string; toUserId: string },
		@ConnectedSocket() client: Socket
	) {
		this.logger.debug(
			`WS: Создание лайка от ${data.fromUserId} к ${data.toUserId}`,
			'LikeGateway'
		)

		// Создаем лайк через сервис
		const result = await this.likeService.createLike({
			fromUserId: data.fromUserId,
			toUserId: data.toUserId,
		})

		// Если успешно создан лайк, публикуем событие
		if (result.success) {
			await this.redisPubSub.publishNewLike({
				fromUserId: data.fromUserId,
				toUserId: data.toUserId,
				timestamp: Date.now(),
			})

			// Если образовался матч, публикуем событие матча
			if (result.data?.isMatch) {
				await this.redisPubSub.publishNewMatch({
					user1Id: data.fromUserId,
					user2Id: data.toUserId,
					chatId: result.data.chatId || '',
					timestamp: Date.now(),
				})

				// Оповещаем получателя через WebSocket
				client.to(data.toUserId).emit('new_match', {
					fromUserId: data.fromUserId,
					toUserId: data.toUserId,
					chatId: result.data.chatId,
				})
			}
		}

		return result
	}

	@SubscribeMessage('get_likes')
	async handleGetLikes(
		@MessageBody()
		data: { telegramId: string; type: 'sent' | 'received' | 'matches' },
		@ConnectedSocket() client: Socket
	) {
		this.logger.debug(
			`WS: Получение лайков для пользователя ${data.telegramId}, тип: ${data.type}`,
			'LikeGateway'
		)

		// Получаем лайки через сервис
		const result = await this.likeService.getLikes({
			telegramId: data.telegramId,
			type: data.type,
		})

		return result
	}

	@SubscribeMessage('delete_like')
	async handleDeleteLike(
		@MessageBody() data: { fromUserId: string; toUserId: string },
		@ConnectedSocket() client: Socket
	) {
		this.logger.debug(
			`WS: Удаление лайка от ${data.fromUserId} к ${data.toUserId}`,
			'LikeGateway'
		)

		// Удаляем лайк через сервис
		const result = await this.likeService.deleteLike(
			data.fromUserId,
			data.toUserId
		)

		return result
	}
}
