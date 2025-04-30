// api/src/chats/chats.controller.ts
import {
	Controller,
	Get,
	Post,
	Body,
	Param,
	Delete,
	Query,
	Patch,
	Logger,
	UseInterceptors,
	UploadedFile,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { MessagePattern, Payload, EventPattern } from '@nestjs/microservices'
import { ChatsService } from './chats.service'
import { WsServerMethod } from './base.types'
import { SendChatsTcpPatterns } from './chats.types'
import { ConnectionDto } from '@/common/abstract/micro/dto/connection.dto'
import { UpdateChatMicroDto } from './dto/update-chat.micro.dto'
import { AddChatMicroDto } from './dto/add-chat.micro.dto'
import { DeleteChatDto } from './dto/delete-chat.dto'
import { FindDto } from './dto/find.dto'
import { CreateDto } from './dto/create.dto'
import { SendMessageDto } from './dto/send-messages.dto'
import { ReadMessagesDto } from './dto/read-messages.dto'
import { SendMessageWithMediaDto } from './dto/send-message-with-media.dto'
import { TypingStatusDto } from './dto/typing-status.dto'
import {
	ApiTags,
	ApiOperation,
	ApiResponse,
	ApiConsumes,
	ApiBody,
} from '@nestjs/swagger'
import { AppLogger } from '../common/logger/logger.service'
import { DeleteChatMicroDto } from './dto/delete-chat.micro.dto'

@ApiTags('chats')
@Controller('chats')
export class ChatsController {
	constructor(
		private readonly chatsService: ChatsService,
		private readonly logger: AppLogger
	) {}

	/**
	 * === REST API методы ===
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

		const result = await this.chatsService.create(createDto)

		// Если чат успешно создан, отправляем уведомление через WebSocket
		if (result.success && result.data) {
			// Оповещение через WebSocket будет сделано в самом сервисе
		}

		return result
	}

	@ApiOperation({ summary: 'Отправить сообщение в чат' })
	@ApiResponse({ status: 201, description: 'Сообщение отправлено' })
	@Post('message')
	async sendMessage(@Body() sendMessageDto: SendMessageDto) {
		this.logger.debug(
			`Запрос на отправку сообщения в чат ${sendMessageDto.chatId} от ${sendMessageDto.fromUser}`,
			'ChatsController'
		)

		const result = await this.chatsService.sendMessage(sendMessageDto)

		// Если сообщение успешно отправлено, отправляем уведомление через WebSocket
		if (result.success && result.data) {
			await this.chatsService.handleNewMessage({
				chatId: sendMessageDto.chatId,
				messageId: result.data.id,
				senderId: sendMessageDto.fromUser,
				text: sendMessageDto.text,
				timestamp: result.data.created_at,
			})
		}

		return result
	}

	@ApiOperation({ summary: 'Пометить сообщения как прочитанные' })
	@ApiResponse({ status: 200, description: 'Статус прочтения обновлен' })
	@Patch('read')
	async readMessages(@Body() readMessagesDto: ReadMessagesDto) {
		this.logger.debug(
			`Запрос на пометку прочитанных сообщений в чате ${readMessagesDto.chatId} от ${readMessagesDto.userId}`,
			'ChatsController'
		)

		const result = await this.chatsService.readMessages(readMessagesDto)

		// Если статус прочтения успешно обновлен, отправляем уведомление через WebSocket
		if (result.success) {
			await this.chatsService.handleMessageRead({
				chatId: readMessagesDto.chatId,
				userId: readMessagesDto.userId,
				messageIds: [readMessagesDto.lastReadMessageId],
			})
		}

		return result
	}

	@ApiOperation({ summary: 'Удалить чат' })
	@ApiResponse({ status: 200, description: 'Чат удален' })
	@Delete(':chatId')
	delete(@Param('chatId') chatId: string) {
		this.logger.debug(`Запрос на удаление чата ${chatId}`, 'ChatsController')
		return this.chatsService.delete(chatId)
	}

	// ... остальные REST API методы ...

	/**
	 * === WebSocket методы ===
	 */

	@MessagePattern(WsServerMethod.JoinRoom)
	async joinRoom(@Payload() data: ConnectionDto) {
		this.logger.debug(
			`WS: Пользователь ${data.telegramId} присоединяется к комнате ${data.roomName}`,
			'ChatsController'
		)
		return this.chatsService.joinRoom(data)
	}

	@MessagePattern(WsServerMethod.LeaveRoom)
	async leaveRoom(@Payload() data: ConnectionDto) {
		this.logger.debug(
			`WS: Пользователь ${data.telegramId} покидает комнату ${data.roomName}`,
			'ChatsController'
		)
		return this.chatsService.leaveRoom(data)
	}

	@MessagePattern(SendChatsTcpPatterns.UpdatedChat)
	async updateChat(@Payload() data: UpdateChatMicroDto) {
		this.logger.debug(`WS: Обновление чата ${data.chatId}`, 'ChatsController')
		return this.chatsService.updateChat(data)
	}

	@MessagePattern(SendChatsTcpPatterns.AddChat)
	async addChat(@Payload() data: AddChatMicroDto) {
		this.logger.debug(`WS: Добавление чата ${data.chatId}`, 'ChatsController')
		return this.chatsService.addChat(data)
	}

	@MessagePattern(SendChatsTcpPatterns.DeleteChat)
	async deleteChat(@Payload() data: DeleteChatMicroDto) {
		this.logger.debug(`WS: Удаление чата ${data.chatId}`, 'ChatsController')
		return this.chatsService.deleteChat(data)
	}

	@MessagePattern('getUserChats')
	async getUserChats(@Payload() data: { userId: string }) {
		this.logger.debug(
			`WS: Получение чатов пользователя ${data.userId}`,
			'ChatsController'
		)
		return this.chatsService.getUserChats(data.userId)
	}

	@MessagePattern('getChatDetails')
	async getChatDetails(@Payload() data: { chatId: string }) {
		this.logger.debug(
			`WS: Получение деталей чата ${data.chatId}`,
			'ChatsController'
		)
		return this.chatsService.getChatDetailsWs(data.chatId)
	}

	@EventPattern('newMessage')
	async handleNewMessage(@Payload() data: any) {
		this.logger.debug(
			`WS Event: Новое сообщение в чате ${data.chatId}`,
			'ChatsController'
		)
		await this.chatsService.handleNewMessage(data)
	}

	@EventPattern('messageRead')
	async handleMessageRead(@Payload() data: any) {
		this.logger.debug(
			`WS Event: Сообщения прочитаны в чате ${data.chatId}`,
			'ChatsController'
		)
		await this.chatsService.handleMessageRead(data)
	}
}
