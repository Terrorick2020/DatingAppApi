import { Controller } from '@nestjs/common'
import { MessagePattern, Payload } from '@nestjs/microservices'
import { ChatsService } from './chats.service'
import { AppLogger } from '../common/logger/logger.service'
import { ConnectionDto } from '../common/abstract/micro/dto/connection.dto'
import { SendChatsTcpPatterns } from './chats.types'
import { FindDto } from './dto/find.dto'

@Controller()
export class ChatsMicroController {
	constructor(
		private readonly chatsService: ChatsService,
		private readonly logger: AppLogger
	) {}

	@MessagePattern('getUserChats')
	async getUserChats(@Payload() data: { userId: string }) {
		this.logger.debug(
			`TCP: Получение чатов пользователя ${data.userId}`,
			'ChatsMicroController'
		)
		return this.chatsService.findAll({ telegramId: data.userId })
	}

	@MessagePattern('getChatDetails')
	async getChatDetails(@Payload() data: { chatId: string }) {
		this.logger.debug(
			`TCP: Получение деталей чата ${data.chatId}`,
			'ChatsMicroController'
		)

		const chatData = await this.chatsService.getChatMetadata(data.chatId)
		const messages = await this.chatsService.getChatMessages(data.chatId, 1, 0) // Получаем только последнее сообщение
		const readStatus = await this.chatsService.getReadStatus(data.chatId)

		return {
			id: data.chatId,
			metadata: chatData.success ? chatData.data : null,
			lastMessage:
				messages.success && messages.data && messages.data.length > 0
					? messages.data[0]
					: null,
			readStatus: readStatus.success ? readStatus.data : {},
		}
	}

	@MessagePattern('getChatMessages')
	async getChatMessages(
		@Payload() data: { chatId: string; limit?: number; offset?: number }
	) {
		this.logger.debug(
			`TCP: Получение сообщений чата ${data.chatId}`,
			'ChatsMicroController'
		)
		return this.chatsService.getChatMessages(
			data.chatId,
			data.limit,
			data.offset
		)
	}

	@MessagePattern('joinRoom')
	async joinRoom(@Payload() data: ConnectionDto) {
		this.logger.debug(
			`TCP: Пользователь ${data.telegramId} присоединяется к комнате ${data.roomName}`,
			'ChatsMicroController'
		)

		// Просто логируем, обработка происходит на WS сервере
		return {
			roomName: data.roomName,
			telegramId: data.telegramId,
			status: 'success',
		}
	}

	@MessagePattern('leaveRoom')
	async leaveRoom(@Payload() data: ConnectionDto) {
		this.logger.debug(
			`TCP: Пользователь ${data.telegramId} покидает комнату ${data.roomName}`,
			'ChatsMicroController'
		)

		// Просто логируем, обработка происходит на WS сервере
		return {
			roomName: data.roomName,
			telegramId: data.telegramId,
			status: 'success',
		}
	}
}
