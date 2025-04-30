import {
	Controller,
	Get,
	Body,
	Post,
	Patch,
	Param,
	Delete,
	Query,
	UseInterceptors,
	UploadedFile,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { MessagePattern, Payload, EventPattern } from '@nestjs/microservices'
import { MessegesService } from './messages.service'
import { FindDto } from './dto/find.dto'
import { CreateDto } from './dto/create.dto'
import { UpdateDto } from './dto/update.dto'
import { WsServerMethod } from '@/chats/base.types'
import { ConnectionDto } from '@/common/abstract/micro/dto/connection.dto'
import { SendMsgsTcpPatterns } from './messages.type'
import { UpdateMicroPartnerDto } from './dto/update-partner.micro.dto'
import { UpdateMicroMsgDto } from './dto/update-msg.micro.dto'
import { multerOptions } from '../config/multer.config'
import {
	ApiTags,
	ApiOperation,
	ApiResponse,
	ApiConsumes,
	ApiBody,
} from '@nestjs/swagger'
import { AppLogger } from '../common/logger/logger.service'

@ApiTags('messages')
@Controller('messages')
export class MessagesController {
	constructor(
		private readonly messagesService: MessegesService,
		private readonly logger: AppLogger
	) {}

	/**
	 * === REST API методы ===
	 */

	@ApiOperation({ summary: 'Получить все сообщения чата' })
	@ApiResponse({ status: 200, description: 'Сообщения чата получены' })
	@Get()
	async findAll(@Query() findDto: FindDto): Promise<any> {
		this.logger.debug(
			`Запрос на получение сообщений чата ${findDto.chatId}`,
			'MessagesController'
		)
		return await this.messagesService.findAll(findDto)
	}

	@ApiOperation({ summary: 'Отправить новое сообщение' })
	@ApiResponse({ status: 201, description: 'Сообщение отправлено' })
	@Post()
	async create(@Body() createDto: CreateDto): Promise<any> {
		this.logger.debug(
			`Запрос на отправку сообщения в чат ${createDto.chatId} от ${createDto.telegramId}`,
			'MessagesController'
		)
		return await this.messagesService.create(createDto)
	}

	@ApiOperation({ summary: 'Обновить сообщение' })
	@ApiResponse({ status: 200, description: 'Сообщение обновлено' })
	@Patch(':msgId')
	async update(
		@Param('msgId') msgId: string,
		@Body() updateDto: UpdateDto
	): Promise<any> {
		this.logger.debug(
			`Запрос на обновление сообщения ${msgId} в чате ${updateDto.chatId}`,
			'MessagesController'
		)
		return await this.messagesService.update(msgId, updateDto)
	}

	@ApiOperation({ summary: 'Удалить сообщение' })
	@ApiResponse({ status: 200, description: 'Сообщение удалено' })
	@Delete(':msgId')
	async delete(@Param('msgId') msgId: string): Promise<any> {
		this.logger.debug(
			`Запрос на удаление сообщения ${msgId}`,
			'MessagesController'
		)
		return await this.messagesService.delete(msgId)
	}

	@ApiOperation({ summary: 'Загрузить медиафайл для сообщения' })
	@ApiConsumes('multipart/form-data')
	@ApiBody({
		schema: {
			type: 'object',
			properties: {
				file: {
					type: 'string',
					format: 'binary',
				},
				chatId: {
					type: 'string',
				},
				fromUser: {
					type: 'string',
				},
			},
		},
	})
	@Post('upload-media')
	@UseInterceptors(FileInterceptor('file', multerOptions))
	async uploadMedia(
		@UploadedFile() file: Express.Multer.File,
		@Body('chatId') chatId: string,
		@Body('fromUser') fromUser: string
	) {
		this.logger.debug(
			`Запрос на загрузку медиафайла для чата ${chatId} от ${fromUser}`,
			'MessagesController'
		)
		return this.messagesService.uploadMediaFile(file, chatId, fromUser)
	}

	@ApiOperation({ summary: 'Отправить сообщение с медиафайлом' })
	@ApiResponse({
		status: 201,
		description: 'Сообщение с медиафайлом отправлено',
	})
	@Post('media')
	async sendWithMedia(
		@Body()
		data: {
			chatId: string
			fromUser: string
			toUser: string
			text: string
			media_type: string
			media_url: string
		}
	) {
		this.logger.debug(
			`Запрос на отправку сообщения с медиафайлом в чат ${data.chatId}`,
			'MessagesController'
		)
		return this.messagesService.sendMessageWithMedia(
			data.chatId,
			data.fromUser,
			data.toUser,
			data.text,
			data.media_type,
			data.media_url
		)
	}

	@ApiOperation({ summary: 'Установить статус "печатает"' })
	@ApiResponse({ status: 200, description: 'Статус установлен' })
	@Post('typing')
	async setTypingStatus(
		@Body() data: { userId: string; chatId: string; isTyping: boolean }
	) {
		this.logger.debug(
			`Запрос на установку статуса "печатает" для ${data.userId} в чате ${data.chatId}`,
			'MessagesController'
		)
		return this.messagesService.setWritingStatus(
			data.userId,
			data.chatId,
			data.isTyping
		)
	}

	@ApiOperation({ summary: 'Получить статус собеседника' })
	@ApiResponse({ status: 200, description: 'Статус получен' })
	@Get('status/:userId')
	async getPartnerStatus(@Param('userId') userId: string) {
		this.logger.debug(
			`Запрос на получение статуса пользователя ${userId}`,
			'MessagesController'
		)
		return this.messagesService.getPartnerStatus(userId)
	}

	/**
	 * === WebSocket методы ===
	 */

	@MessagePattern(WsServerMethod.JoinRoom)
	async joinRoom(@Payload() data: ConnectionDto) {
		this.logger.debug(
			`WS: Пользователь ${data.telegramId} присоединяется к комнате ${data.roomName}`,
			'MessagesController'
		)
		return this.messagesService.joinRoom(data)
	}

	@MessagePattern(WsServerMethod.LeaveRoom)
	async leaveRoom(@Payload() data: ConnectionDto) {
		this.logger.debug(
			`WS: Пользователь ${data.telegramId} покидает комнату ${data.roomName}`,
			'MessagesController'
		)
		return this.messagesService.leaveRoom(data)
	}

	@MessagePattern(SendMsgsTcpPatterns.UpdatePartner)
	async handleUpdatePartner(@Payload() data: UpdateMicroPartnerDto) {
		this.logger.debug(
			`WS: Обновление статуса собеседника ${data.telegramId}`,
			'MessagesController'
		)
		return this.messagesService.handleUpdatePartner(data)
	}

	@MessagePattern(SendMsgsTcpPatterns.UpdateMsg)
	async handleUpdateMsg(@Payload() data: UpdateMicroMsgDto) {
		this.logger.debug(
			`WS: Обновление сообщения в чате ${data.chatId}`,
			'MessagesController'
		)
		return this.messagesService.handleUpdateMessage(data)
	}

	@EventPattern('messageRead')
	async handleMessageRead(@Payload() data: any) {
		this.logger.debug(
			`WS Event: Сообщение прочитано в чате ${data.chatId}`,
			'MessagesController'
		)
		return this.messagesService.handleMessageRead(data)
	}
}
