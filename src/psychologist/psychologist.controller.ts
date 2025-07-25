import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    ParseIntPipe,
    Post,
    Put,
    Query,
    Request
} from '@nestjs/common'
import {
    ApiBearerAuth,
    ApiOperation,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger'
import { AppLogger } from '../common/logger/logger.service'
import { CheckPsychologistDto } from './dto/check-psychologist.dto'
import { CreatePsychologistDto } from './dto/create-psychologist.dto'
import { DeletePsychologistDto } from './dto/delete-psychologist.dto'
import { FindPsychologistBySelectorDto } from './dto/find-psychologist-by-selector.dto'
import { FindPsychologistsDto } from './dto/find-psychologists.dto'
import { UpdatePsychologistDto } from './dto/update-psychologist.dto'
import { PsychologistService } from './psychologist.service'
import { Status } from '../common/decorators/status.decorator'

@ApiTags('Психологи')
@Controller('psychologists')
export class PsychologistController {
	constructor(
		private readonly psychologistService: PsychologistService,
		private readonly logger: AppLogger
	) {}

	@ApiOperation({ summary: 'Регистрация психолога' })
	@ApiResponse({ status: 201, description: 'Психолог успешно зарегистрирован' })
	@ApiResponse({ status: 400, description: 'Ошибка валидации' })
	@ApiResponse({ status: 409, description: 'Психолог с таким Telegram ID уже существует' })
	@Post()
	create(@Body() createPsychologistDto: CreatePsychologistDto) {
		this.logger.debug(
			`Запрос на регистрацию психолога ${createPsychologistDto.telegramId}`,
			'PsychologistController'
		)
		return this.psychologistService.create(createPsychologistDto)
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

	@ApiOperation({ summary: 'Получение списка доступных психологов (исключая существующие чаты)' })
	@ApiResponse({ status: 200, description: 'Список доступных психологов получен' })
	@Post('available')
	findAllExcludingExistingChats(@Body() dto: FindPsychologistsDto & { userTelegramId: string }) {
		this.logger.debug(
			`Запрос на получение списка доступных психологов для пользователя ${dto.userTelegramId}`,
			'PsychologistController'
		)
		return this.psychologistService.findAllExcludingExistingChats(dto)
	}

	@ApiOperation({ summary: 'Получение психолога по ID' })
	@ApiResponse({ status: 200, description: 'Психолог найден' })
	@ApiResponse({ status: 404, description: 'Психолог не найден' })
	@Get(':id')
	findById(@Param('id', ParseIntPipe) id: number) {
		this.logger.debug(
			`Запрос на получение психолога с ID ${id}`,
			'PsychologistController'
		)
		return this.psychologistService.findById(id)
	}

	@ApiOperation({ summary: 'Поиск психолога по селектору (ID или имя)' })
	@ApiResponse({ status: 200, description: 'Психолог найден' })
	@ApiResponse({ status: 404, description: 'Психолог не найден' })
	@Post('find')
	findBySelector(@Body() findPsychologistBySelectorDto: FindPsychologistBySelectorDto) {
		this.logger.debug(
			`Запрос на поиск психолога по селектору: ${findPsychologistBySelectorDto.selector}`,
			'PsychologistController'
		)
		return this.psychologistService.findBySelector(findPsychologistBySelectorDto)
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
	@ApiBearerAuth()
	@Delete()
	delete(@Body() deletePsychologistDto: DeletePsychologistDto) {
		this.logger.debug(
			`Запрос на удаление психолога ${deletePsychologistDto.telegramId}`,
			'PsychologistController'
		)
		return this.psychologistService.delete(deletePsychologistDto)
	}

	@ApiOperation({ summary: 'Генерация ссылки для регистрации психолога (только для админов)' })
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
} 