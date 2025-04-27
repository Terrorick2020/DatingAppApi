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
import { ChatsService } from './chats.service'
import { FindDto } from './dto/find.dto'
import { CreateDto } from './dto/create.dto'
import { SendMessageDto } from './dto/send-messages.dto'
import { ReadMessagesDto } from './dto/read-messages.dto'
import { GetMessagesDto } from './dto/get.messages.dto'
import { DeleteChatDto } from './dto/delete-chat.dto'
import {
	ApiTags,
	ApiOperation,
	ApiResponse,
	ApiConsumes,
	ApiBody,
} from '@nestjs/swagger'
import { SendMessageWithMediaDto } from './dto/send-message-with-media.dto'
import { TypingStatusDto } from './dto/typing-status.dto'

@ApiTags('chats')
@Controller('chats')
export class ChatsController {
	private readonly logger = new Logger(ChatsController.name)

	constructor(private readonly chatsService: ChatsService) {}

	@ApiOperation({ summary: 'Получить список всех чатов пользователя' })
	@ApiResponse({ status: 200, description: 'Список чатов успешно получен' })
	@Get()
	findAll(@Query() findDto: FindDto) {
		this.logger.debug(
			`Запрос на получение чатов для пользователя ${findDto.telegramId}`
		)
		return this.chatsService.findAll(findDto)
	}

	@ApiOperation({ summary: 'Получить метаданные чата' })
	@ApiResponse({ status: 200, description: 'Метаданные чата получены' })
	@Get(':chatId/metadata')
	getChatMetadata(@Param('chatId') chatId: string) {
		this.logger.debug(`Запрос на получение метаданных чата ${chatId}`)
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
			`Запрос на получение сообщений чата ${chatId}, лимит: ${limit}, смещение: ${offset}`
		)
		return this.chatsService.getChatMessages(chatId, limit, offset)
	}

	@ApiOperation({ summary: 'Создать новый чат' })
	@ApiResponse({ status: 201, description: 'Чат успешно создан' })
	@Post()
	create(@Body() createDto: CreateDto) {
		this.logger.debug(
			`Запрос на создание чата от ${createDto.telegramId} к ${createDto.toUser}`
		)
		return this.chatsService.create(createDto)
	}

	@ApiOperation({ summary: 'Отправить сообщение в чат' })
	@ApiResponse({ status: 201, description: 'Сообщение отправлено' })
	@Post('message')
	sendMessage(@Body() sendMessageDto: SendMessageDto) {
		this.logger.debug(
			`Запрос на отправку сообщения в чат ${sendMessageDto.chatId} от ${sendMessageDto.fromUser}`
		)
		return this.chatsService.sendMessage(sendMessageDto)
	}

	@ApiOperation({ summary: 'Пометить сообщения как прочитанные' })
	@ApiResponse({ status: 200, description: 'Статус прочтения обновлен' })
	@Patch('read')
	readMessages(@Body() readMessagesDto: ReadMessagesDto) {
		this.logger.debug(
			`Запрос на пометку прочитанных сообщений в чате ${readMessagesDto.chatId} от ${readMessagesDto.userId}`
		)
		return this.chatsService.readMessages(readMessagesDto)
	}

	@ApiOperation({ summary: 'Удалить чат' })
	@ApiResponse({ status: 200, description: 'Чат удален' })
	@Delete(':chatId')
	delete(@Param('chatId') chatId: string) {
		this.logger.debug(`Запрос на удаление чата ${chatId}`)
		return this.chatsService.delete(chatId)
	}

	@ApiOperation({ summary: 'Обновить статус набора текста' })
	@ApiResponse({ status: 200, description: 'Статус набора текста обновлен' })
	@Post('typing')
	updateTypingStatus(@Body() typingStatusDto: TypingStatusDto) {
		this.logger.debug(
			`Запрос на обновление статуса набора в чате ${typingStatusDto.chatId} от ${typingStatusDto.userId}`
		)
		return this.chatsService.updateTypingStatus(typingStatusDto)
	}

	@ApiOperation({ summary: 'Получить статус набора текста в чате' })
	@ApiResponse({ status: 200, description: 'Статус набора текста получен' })
	@Get(':chatId/typing')
	getTypingStatus(
		@Param('chatId') chatId: string,
		@Query('userId') userId: string
	) {
		this.logger.debug(
			`Запрос на получение статуса набора текста в чате ${chatId} для пользователя ${userId}`
		)
		return this.chatsService.getTypingStatus(chatId, userId)
	}

	@ApiOperation({ summary: 'Отправить сообщение с медиафайлом' })
	@ApiResponse({
		status: 201,
		description: 'Сообщение с медиафайлом отправлено',
	})
	@Post('message/media')
	sendMessageWithMedia(
		@Body() sendMessageWithMediaDto: SendMessageWithMediaDto
	) {
		this.logger.debug(
			`Запрос на отправку сообщения с медиа в чат ${sendMessageWithMediaDto.chatId}`
		)
		return this.chatsService.sendMessageWithMedia(sendMessageWithMediaDto)
	}

	@ApiOperation({ summary: 'Загрузить медиафайл для сообщения' })
	@ApiResponse({ status: 201, description: 'Медиафайл загружен' })
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
	@Post('message/upload-media')
	@UseInterceptors(FileInterceptor('file'))
	async uploadMediaFile(
		@UploadedFile() file: Express.Multer.File,
		@Body('chatId') chatId: string,
		@Body('fromUser') fromUser: string
	) {
		this.logger.debug(
			`Запрос на загрузку медиафайла для чата ${chatId} от пользователя ${fromUser}`
		)
		return this.chatsService.uploadMediaFile(file, chatId, fromUser)
	}

	@ApiOperation({ summary: 'Получить архивы чатов пользователя' })
	@ApiResponse({ status: 200, description: 'Список архивов чатов получен' })
	@Get('archives/:telegramId')
	getChatArchives(@Param('telegramId') telegramId: string) {
		this.logger.debug(
			`Запрос на получение архивов чатов для пользователя ${telegramId}`
		)
		return this.chatsService.getChatArchives(telegramId)
	}
}
