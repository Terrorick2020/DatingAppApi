import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	Post,
	Put,
	Query,
	Request,
	UploadedFile,
	UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import {
	ApiBearerAuth,
	ApiBody,
	ApiConsumes,
	ApiOperation,
	ApiResponse,
	ApiTags,
} from '@nestjs/swagger'
import { AppLogger } from '../common/logger/logger.service'
import { multerOptions } from '../config/multer.config'
import { StorageService } from '../storage/storage.service'
import { CheckPsychologistDto } from './dto/check-psychologist.dto'
import { CreatePsychologistDto } from './dto/create-psychologist.dto'
import { DeletePsychologistPhotoDto } from './dto/delete-photo.dto'
import { DeletePsychologistDto } from './dto/delete-psychologist.dto'
import { FindPsychologistBySelectorDto } from './dto/find-psychologist-by-selector.dto'
import { FindPsychologistsDto } from './dto/find-psychologists.dto'
import { RegisterByInviteDto } from './dto/register-by-invite.dto'
import { UpdatePsychologistDto } from './dto/update-psychologist.dto'
import { UploadPhotoRequestDto } from './dto/upload-photo-request.dto'
import { PsychologistService } from './psychologist.service'

@ApiTags('Психологи')
@Controller('psychologists')
export class PsychologistController {
	constructor(
		private readonly psychologistService: PsychologistService,
		private readonly logger: AppLogger,
		private readonly storageService: StorageService
	) {}

	@ApiOperation({ summary: 'Регистрация психолога' })
	@ApiResponse({ status: 201, description: 'Психолог успешно зарегистрирован' })
	@ApiResponse({ status: 400, description: 'Ошибка валидации' })
	@ApiResponse({
		status: 409,
		description: 'Психолог с таким Telegram ID уже существует',
	})
	@Post()
	create(@Body() createPsychologistDto: CreatePsychologistDto) {
		this.logger.debug(
			`Запрос на регистрацию психолога ${createPsychologistDto.telegramId}`,
			'PsychologistController'
		)
		return this.psychologistService.create(createPsychologistDto)
	}

	@ApiOperation({ summary: 'Загрузка фотографии психолога' })
	@ApiConsumes('multipart/form-data')
	@ApiBody({
		schema: {
			type: 'object',
			properties: {
				photo: {
					type: 'string',
					format: 'binary',
					description: 'Фотография для загрузки',
				},
				telegramId: {
					type: 'string',
					description: 'Telegram ID психолога',
				},
			},
			required: ['photo', 'telegramId'],
		},
	})
	@ApiResponse({
		status: 201,
		description: 'Фотография успешно загружена и временно сохранена',
	})
	@Post('upload-photo')
	@UseInterceptors(FileInterceptor('photo', multerOptions))
	async uploadPhoto(
		@UploadedFile() file: any,
		@Body() dto: UploadPhotoRequestDto
	) {
		this.logger.debug(
			`Запрос на загрузку фото для психолога ${dto.telegramId}`,
			'PsychologistController'
		)

		const key = await this.storageService.uploadPhoto(file)
		return this.psychologistService.uploadPhoto(dto.telegramId, key)
	}

	@ApiOperation({ summary: 'Удаление фотографии психолога' })
	@ApiResponse({
		status: 200,
		description: 'Фотография успешно удалена',
	})
	@ApiResponse({
		status: 404,
		description: 'Фотография не найдена',
	})
	@ApiBody({ type: DeletePsychologistPhotoDto })
	@Post('delete-photo')
	async deletePhoto(
		@Body() DeletePsychologistPhotoDto: DeletePsychologistPhotoDto
	) {
		this.logger.debug(
			`Запрос на удаление фото ${DeletePsychologistPhotoDto.photoId} для психолога ${DeletePsychologistPhotoDto.telegramId}`,
			'PsychologistController'
		)
		return this.psychologistService.deletePhoto(
			DeletePsychologistPhotoDto.photoId,
			DeletePsychologistPhotoDto.telegramId
		)
	}

	@ApiOperation({ summary: 'Получение списка психологов' })
	@ApiResponse({ status: 200, description: 'Список психологов получен' })
	@Get()
	findAll(@Query() findPsychologistsDto: FindPsychologistsDto) {
		this.logger.debug(
			`Запрос на получение списка психологов`,
			'PsychologistController'
		)
		return this.psychologistService.findAll(findPsychologistsDto)
	}

	@ApiOperation({
		summary: 'Получение списка доступных психологов',
	})
	@ApiResponse({
		status: 200,
		description: 'Список доступных психологов получен',
	})
	@Post('available')
	findAllExcludingExistingChats(
		@Body() dto: FindPsychologistsDto & { userTelegramId: string }
	) {
		this.logger.debug(
			`Запрос на получение списка доступных психологов для пользователя ${dto.userTelegramId}`,
			'PsychologistController'
		)
		return this.psychologistService.findAllExcludingExistingChats(dto)
	}

	@ApiOperation({ summary: 'Получение психолога по Telegram ID' })
	@ApiResponse({ status: 200, description: 'Психолог найден' })
	@ApiResponse({ status: 404, description: 'Психолог не найден' })
	@Get(':telegramId')
	findByTelegramId(@Param('telegramId') telegramId: string) {
		this.logger.debug(
			`Запрос на получение психолога с Telegram ID ${telegramId}`,
			'PsychologistController'
		)
		return this.psychologistService.findByTelegramId(telegramId)
	}

	@ApiOperation({ summary: 'Поиск психолога по селектору (ID или имя)' })
	@ApiResponse({ status: 200, description: 'Психолог найден' })
	@ApiResponse({ status: 404, description: 'Психолог не найден' })
	@Post('find')
	findBySelector(
		@Body() findPsychologistBySelectorDto: FindPsychologistBySelectorDto
	) {
		this.logger.debug(
			`Запрос на поиск психолога по селектору: ${findPsychologistBySelectorDto.selector}`,
			'PsychologistController'
		)
		return this.psychologistService.findBySelector(
			findPsychologistBySelectorDto
		)
	}

	@ApiOperation({ summary: 'Обновление профиля психолога' })
	@ApiResponse({ status: 200, description: 'Профиль обновлен' })
	@ApiResponse({ status: 404, description: 'Психолог не найден' })
	@Put(':telegramId')
	update(
		@Param('telegramId') telegramId: string,
		@Body() updatePsychologistDto: UpdatePsychologistDto
	) {
		this.logger.debug(
			`Запрос на обновление профиля психолога ${telegramId}`,
			'PsychologistController'
		)
		return this.psychologistService.update(telegramId, updatePsychologistDto)
	}

	@ApiOperation({ summary: 'Проверка регистрации психолога' })
	@ApiResponse({ status: 200, description: 'Психолог найден' })
	@ApiResponse({ status: 404, description: 'Психолог не найден' })
	@Post('check')
	check(@Body() checkPsychologistDto: CheckPsychologistDto) {
		this.logger.debug(
			`Запрос на проверку регистрации психолога ${checkPsychologistDto.telegramId}`,
			'PsychologistController'
		)
		return this.psychologistService.check(checkPsychologistDto)
	}

	@ApiOperation({ summary: 'Удаление психолога' })
	@ApiResponse({ status: 200, description: 'Психолог удален' })
	@ApiResponse({ status: 404, description: 'Психолог не найден' })
	// @ApiBearerAuth()
	@Delete()
	delete(@Body() deletePsychologistDto: DeletePsychologistDto) {
		this.logger.debug(
			`Запрос на удаление психолога ${deletePsychologistDto.telegramId}`,
			'PsychologistController'
		)
		return this.psychologistService.delete(deletePsychologistDto)
	}

	@ApiOperation({
		summary: 'Генерация ссылки для регистрации психолога (только для админов)',
	})
	@ApiResponse({ status: 201, description: 'Ссылка создана' })
	@Post('generate-invite-link')
	generateInviteLink(@Request() req: any) {
		this.logger.debug(
			`Запрос на генерацию ссылки для психолога от ${req.user?.telegramId}`,
			'PsychologistController'
		)
		return this.psychologistService.generatePsychologistInviteLink(
			req.user?.telegramId || 'admin'
		)
	}

	@ApiOperation({ summary: 'Проверка валидности кода приглашения' })
	@ApiResponse({ status: 200, description: 'Код проверен' })
	@Post('validate-invite-code')
	validateInviteCode(@Body() body: { code: string }) {
		this.logger.debug(
			`Запрос на проверку кода: ${body.code}`,
			'PsychologistController'
		)
		return this.psychologistService.validateInviteCode(body.code)
	}

	@ApiOperation({ summary: 'Регистрация психолога по коду приглашения' })
	@ApiResponse({
		status: 201,
		description: 'Психолог успешно зарегистрирован по приглашению',
	})
	@ApiResponse({ status: 400, description: 'Неверный код приглашения' })
	@Post('register-by-invite')
	registerByInvite(@Body() registerByInviteDto: RegisterByInviteDto) {
		this.logger.debug(
			`Запрос на регистрацию психолога по коду: ${registerByInviteDto.code}`,
			'PsychologistController'
		)
		return this.psychologistService.registerByInvite(registerByInviteDto)
	}
}
