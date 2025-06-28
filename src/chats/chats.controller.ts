import { ConnectionDto } from '@/common/abstract/micro/dto/connection.dto'
import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	Patch,
	Post,
	Query,
} from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { AppLogger } from '../common/logger/logger.service'
import { ChatsService } from './chats.service'
import { CreateDto } from './dto/create.dto'
import { FindDto } from './dto/find.dto'
import { ReadMessagesDto } from './dto/read-messages.dto'
import { SendMessageDto } from './dto/send-messages.dto'
import { SendMessageWithMediaDto } from './dto/send-message-with-media.dto'
import { TypingStatusDto } from './dto/typing-status.dto'

@ApiTags('chats')
@Controller('chats')
export class ChatsController {
	constructor(
		private readonly chatsService: ChatsService,
		private readonly logger: AppLogger
	) {}

	/**
	 * REST API методы
	 */

	@ApiOperation({ summary: 'Получить список всех чатов пользователя' })
	@ApiResponse({ status: 200, description: 'Список чатов успешно получен' })
	@Get()
	findAll(@Query() findDto: FindDto) {
		this.logger.debug(
			`Запрос на получение чатов для пользователя ${findDto.telegramId}`,
			'ChatsController'
		)
		return this.chatsService.findAll(findDto)
	}

	@ApiOperation({ summary: 'Получить метаданные чата' })
	@ApiResponse({ status: 200, description: 'Метаданные чата получены' })
	@Get(':chatId/metadata')
	getChatMetadata(@Param('chatId') chatId: string) {
		this.logger.debug(
			`Запрос на получение метаданных чата ${chatId}`,
			'ChatsController'
		)
		return this.chatsService.getChatMetadata(chatId)
	}

	@ApiOperation({ summary: 'Получить сообщения чата' })
	@ApiResponse({ status: 200, description: 'Сообщения чата получены' })
	@Get(':chatId/messages')
	getChatMessages(
		@Param('chatId') chatId: string,
		@Query('limit') limit: number = 50,
		@Query('offset') offset: number = 0
	) {
		this.logger.debug(
			`Запрос на получение сообщений чата ${chatId}, лимит: ${limit}, смещение: ${offset}`,
			'ChatsController'
		)
		return this.chatsService.getChatMessages(chatId, limit, offset)
	}

	@ApiOperation({ summary: 'Создать новый чат' })
	@ApiResponse({ status: 201, description: 'Чат успешно создан' })
	@Post()
	async create(@Body() createDto: CreateDto) {
		this.logger.debug(
			`Запрос на создание чата от ${createDto.telegramId} к ${createDto.toUser}`,
			'ChatsController'
		)
		return this.chatsService.create(createDto)
	}

	@ApiOperation({ summary: 'Отправить сообщение в чат' })
	@ApiResponse({ status: 201, description: 'Сообщение отправлено' })
	@Post('message')
	async sendMessage(@Body() sendMessageDto: SendMessageDto) {
		this.logger.debug(
			`Запрос на отправку сообщения в чат ${sendMessageDto.chatId} от ${sendMessageDto.fromUser}`,
			'ChatsController'
		)
		return this.chatsService.sendMessage(sendMessageDto)
	}

	@ApiOperation({ summary: 'Отправить сообщение с медиафайлом' })
	@ApiResponse({
		status: 201,
		description: 'Сообщение с медиафайлом отправлено',
	})
	@Post('message-media')
	async sendMessageWithMedia(@Body() dto: SendMessageWithMediaDto) {
		this.logger.debug(
			`Запрос на отправку сообщения с медиафайлом в чат ${dto.chatId} от ${dto.fromUser}`,
			'ChatsController'
		)
		return this.chatsService.sendMessageWithMedia(dto)
	}

	@ApiOperation({ summary: 'Пометить сообщения как прочитанные' })
	@ApiResponse({ status: 200, description: 'Статус прочтения обновлен' })
	@Patch('read')
	async readMessages(@Body() readMessagesDto: ReadMessagesDto) {
		this.logger.debug(
			`Запрос на пометку прочитанных сообщений в чате ${readMessagesDto.chatId} от ${readMessagesDto.userId}`,
			'ChatsController'
		)
		return this.chatsService.readMessages(readMessagesDto)
	}

	@ApiOperation({ summary: 'Обновить статус набора текста' })
	@ApiResponse({ status: 200, description: 'Статус набора текста обновлен' })
	@Post('typing')
	async updateTypingStatus(@Body() typingStatusDto: TypingStatusDto) {
		this.logger.debug(
			`Запрос на обновление статуса набора текста в чате ${typingStatusDto.chatId} от ${typingStatusDto.userId}`,
			'ChatsController'
		)
		return this.chatsService.updateTypingStatus(typingStatusDto)
	}

	@ApiOperation({ summary: 'Удалить чат' })
	@ApiResponse({ status: 200, description: 'Чат удален' })
	@Delete(':chatId')
	delete(@Param('chatId') chatId: string) {
		this.logger.debug(`Запрос на удаление чата ${chatId}`, 'ChatsController')
		return this.chatsService.delete(chatId)
	}

	@ApiOperation({ summary: 'Получить количество непрочитанных чатов' })
	@ApiResponse({ status: 200, description: 'Количество получено' })
	@Get('unread-chats-count')
	async getUnreadChatsCount(@Query('telegramId') telegramId: string) {
		return this.chatsService.getChatsWithUnread(telegramId)
	}
}
