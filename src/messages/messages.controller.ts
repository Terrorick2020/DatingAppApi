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
import { MessegesService } from './messages.service'
import { FindDto } from './dto/find.dto'
import { CreateDto } from './dto/create.dto'
import { UpdateDto } from './dto/update.dto'
import { multerOptions } from '../config/multer.config'
import { ReadMessagesDto } from '../chats/dto/read-messages.dto'
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
	 * Получение сообщений чата
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

	/**
	 * Отправка нового сообщения
	 */
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

	/**
	 * Обновление сообщения
	 */
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

	/**
	 * Удаление сообщения
	 */
	@ApiOperation({ summary: 'Удалить сообщение' })
	@ApiResponse({ status: 200, description: 'Сообщение удалено' })
	@Delete(':msgId')
	async delete(
		@Param('msgId') msgId: string,
		@Query('chatId') chatId: string
	): Promise<any> {
		this.logger.debug(
			`Запрос на удаление сообщения ${msgId} из чата ${chatId}`,
			'MessagesController'
		)
		return await this.messagesService.delete(msgId, chatId)
	}

	/**
	 * Загрузка медиафайла
	 */
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

	/**
	 * Отправка сообщения с медиафайлом
	 */
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

	/**
	 * Установка статуса "печатает"
	 */
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
		return this.messagesService.setTypingStatus(
			data.userId,
			data.chatId,
			data.isTyping
		)
	}

	/**
	 * Пометить сообщения как прочитанные
	 */
	@ApiOperation({ summary: 'Отметить сообщения как прочитанные' })
	@ApiResponse({
		status: 200,
		description: 'Сообщения отмечены как прочитанные',
	})
	@Post('read')
	async readMessages(@Body() readMessagesDto: ReadMessagesDto) {
		this.logger.debug(
			`Запрос на отметку прочтения сообщений в чате ${readMessagesDto.chatId}`,
			'MessagesController'
		)
		return this.messagesService.readMessages(readMessagesDto)
	}
}
