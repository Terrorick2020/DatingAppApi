import {
    Inject,
    Injectable,
    OnModuleDestroy,
    OnModuleInit,
    forwardRef,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Redis from 'ioredis'
import { WebSocketService } from '../../websocket/websocket.service'
import { AppLogger } from '../logger/logger.service'

@Injectable()
export class RedisPubSubSubscriber implements OnModuleInit, OnModuleDestroy {
	private subscriber: Redis
	private readonly channels = [
		'chat:newMessage',
		'chat:messageRead',
		'chat:typing',
		'like:new',
		'match:new',
		'complaint:update',
		'user:status',
		'chat:deleted',
	]
	private readonly CONTEXT = 'RedisPubSubSubscriber'

	constructor(
		private readonly logger: AppLogger,
		private readonly configService: ConfigService,
		@Inject(forwardRef(() => WebSocketService))
		private readonly webSocketService: WebSocketService
	) {
		this.subscriber = new Redis({
			host: this.configService.get('REDIS_HOST', 'localhost'),
			port: parseInt(this.configService.get('REDIS_PORT', '6379')),
			password: this.configService.get('REDIS_PASSWORD', ''),
			db: parseInt(this.configService.get('REDIS_DB', '0')),
		})
	}

	async onModuleInit() {
		// Подписываемся на каналы
		await this.subscriber.subscribe(...this.channels)

		// Обработчик сообщений
		this.subscriber.on('message', (channel, message) => {
			try {
				const data = JSON.parse(message)
				this.logger.debug(
					`Получено сообщение в канале ${channel}`,
					this.CONTEXT
				)
				this.handleMessage(channel, data)
			} catch (error: any) {
				this.logger.error(
					`Ошибка при обработке сообщения из Redis: ${error.message}`,
					error.stack,
					this.CONTEXT
				)
			}
		})

		this.logger.log('Redis Pub/Sub подписчик инициализирован', this.CONTEXT)
	}

	async onModuleDestroy() {
		await this.subscriber.unsubscribe(...this.channels)
		await this.subscriber.quit()
		this.logger.log('Redis Pub/Sub подписчик остановлен', this.CONTEXT)
	}

	private handleMessage(channel: string, data: any) {
		switch (channel) {
			case 'chat:newMessage':
				this.handleNewMessage(data)
				break
			case 'chat:messageRead':
				this.handleMessageRead(data)
				break
			case 'chat:typing':
				this.handleTypingStatus(data)
				break
			case 'like:new':
				this.handleNewLike(data)
				break
			case 'match:new':
				this.handleNewMatch(data)
				break
			case 'complaint:update':
				this.handleComplaintUpdate(data)
				break
			case 'user:status':
				this.handleUserStatus(data)
				break
			case 'chat:deleted':
				this.handleChatDeleted(data)
				break
			default:
				this.logger.warn(`Неизвестный канал: ${channel}`, this.CONTEXT)
		}
	}

	private handleNewMessage(data: any) {
		const { chatId, recipientId } = data

		if (recipientId) {
			this.webSocketService.sendToUser(recipientId, 'newMessage', data)
		}
	}

	private handleMessageRead(data: any) {
		const { chatId, userId, messageIds } = data

		// Обычно нужно уведомить отправителя сообщения о прочтении
		if (data.senderId) {
			this.webSocketService.sendToUser(data.senderId, 'messageRead', data)
		}
	}

	private handleTypingStatus(data: any) {
		const { chatId, userId, isTyping, participants } = data

		// Уведомляем всех участников чата кроме самого печатающего
		if (participants && Array.isArray(participants)) {
			participants.forEach(participantId => {
				if (participantId !== userId) {
					this.webSocketService.sendToUser(participantId, 'typingStatus', {
						chatId,
						userId,
						recipientId: participantId,
						isTyping,
					})
				}
			})
		}
	}

	private handleNewLike(data: any) {
		const { fromUserId, toUserId } = data

		// Уведомляем получателя лайка
		this.webSocketService.sendToUser(toUserId, 'newLike', data)
	}

	private handleNewMatch(data: any) {
		const { user1Id, user2Id } = data

		// Уведомляем обоих участников матча
		this.webSocketService.sendToUser(user1Id, 'newMatch', data)
		this.webSocketService.sendToUser(user2Id, 'newMatch', data)
	}

	private handleComplaintUpdate(data: any) {
		const { id, fromUserId, status } = data

		// Уведомляем пользователя, создавшего жалобу
		if (fromUserId) {
			this.webSocketService.sendToUser(fromUserId, 'complaintUpdate', {
				id,
				status,
				timestamp: data.timestamp || Date.now(),
			})
		}
	}

	private handleUserStatus(data: any) {
		const { userId, status, notifyUsers } = data

		// Уведомляем всех указанных пользователей об изменении статуса
		if (notifyUsers && Array.isArray(notifyUsers)) {
			notifyUsers.forEach(notifyUserId => {
				this.webSocketService.sendToUser(notifyUserId, 'userStatus', {
					userId,
					notifyUserId,
					status,
					timestamp: data.timestamp || Date.now(),
				})
			})
		}
	}

	private handleChatDeleted(data: any) {
		const { chatId, deletedByUserId, participants } = data
		// Уведомляем всех участников чата кроме того, кто удалил
		if (participants && Array.isArray(participants)) {
			participants.forEach(participantId => {
				if (participantId !== deletedByUserId) {
					this.webSocketService.sendToUser(participantId, 'chatDeleted', {
						chatId,
						deletedByUserId,
						timestamp: data.timestamp || Date.now(),
					})
				}
			})
		}
	}
}
