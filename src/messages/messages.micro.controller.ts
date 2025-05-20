import { Controller } from '@nestjs/common'
import { MessagePattern, Payload } from '@nestjs/microservices'
import { MessegesService } from './messages.service'
import { AppLogger } from '../common/logger/logger.service'
import { ConnectionDto } from '../common/abstract/micro/dto/connection.dto'
import { UpdateDto } from './dto/update.dto'
import { FindDto } from './dto/find.dto'

@Controller()
export class MessagesMicroController {
	constructor(
		private readonly messagesService: MessegesService,
		private readonly logger: AppLogger
	) {}

	/**
	 * Получение сообщений чата
	 */
	@MessagePattern('getMessages')
	async getMessages(@Payload() data: FindDto) {
		this.logger.debug(
			`TCP: Получение сообщений чата ${data.chatId}`,
			'MessagesMicroController'
		)
		return this.messagesService.findAll(data)
	}

	/**
	 * Отправка сообщения
	 */
	@MessagePattern('sendMessage')
	async sendMessage(@Payload() createDto: any) {
		this.logger.debug(
			`TCP: Отправка сообщения в чат ${createDto.chatId}`,
			'MessagesMicroController'
		)
		return this.messagesService.create(createDto)
	}

	/**
	 * Обновление сообщения
	 */
	@MessagePattern('updateMessage')
	async updateMessage(
		@Payload() data: { msgId: string; updateDto: UpdateDto }
	) {
		this.logger.debug(
			`TCP: Обновление сообщения ${data.msgId}`,
			'MessagesMicroController'
		)
		return this.messagesService.update(data.msgId, data.updateDto)
	}

	/**
	 * Отметка сообщений как прочитанные
	 */
	@MessagePattern('readMessages')
	async readMessages(@Payload() data: any) {
		this.logger.debug(
			`TCP: Отметка прочтения сообщений в чате ${data.chatId}`,
			'MessagesMicroController'
		)
		return this.messagesService.readMessages(data)
	}

	/**
	 * Установка статуса набора текста
	 */
	@MessagePattern('setTypingStatus')
	async setTypingStatus(@Payload() data: any) {
		this.logger.debug(
			`TCP: Установка статуса набора текста в чате ${data.chatId}`,
			'MessagesMicroController'
		)
		return this.messagesService.setTypingStatus(
			data.userId,
			data.chatId,
			data.isTyping
		)
	}
}
