import {
	Body,
	Controller,
	HttpCode,
	Post,
	UploadedFile,
	UseGuards,
	UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { multerOptions } from '../config/multer.config'
import { StorageService } from '../storage/storage.service'
import { AuthService } from './auth.service'
import { CreateAuthDto } from './dto/create-auth.dto'
import { UploadPhotoRequestDto } from './dto/upload-photo-request.dto'
import { UploadPhotoInternalDto } from './dto/upload-photo-internal.dto'
import { CheckAuthDto } from './dto/check-auth.dto'
import {
	ApiTags,
	ApiOperation,
	ApiResponse,
	ApiConsumes,
	ApiBody,
} from '@nestjs/swagger'
import { RegistrationRateLimitGuard } from '../common/guards/rate-limit.guard'
import { LoginDto } from './dto/login.dto'

@ApiTags('auth')
@Controller('auth')
export class AuthController {
	constructor(
		private readonly authService: AuthService,
		private readonly storageService: StorageService
	) {}

	@ApiOperation({ summary: 'Проверка статуса пользователя' })
	@ApiResponse({
		status: 200,
		description: 'Возвращает статус пользователя - зарегистрирован или нет',
	})
	@ApiBody({ type: CheckAuthDto })
	@HttpCode(200)
	@Post('check')
	check(@Body() checkAuthDto: CheckAuthDto): Promise<any> {
		return this.authService.check(checkAuthDto)
	}

	@ApiOperation({ summary: 'Загрузка фотографии профиля' })
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
					description: 'Telegram ID пользователя',
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
		@UploadedFile() file: Express.Multer.File,
		@Body() dto: UploadPhotoRequestDto
	) {
		const key = await this.storageService.uploadPhoto(file)
		const internalDto: UploadPhotoInternalDto = { ...dto, key }
		return this.authService.uploadPhoto(internalDto)
	}

	@ApiOperation({ summary: 'Регистрация нового пользователя' })
	@ApiResponse({
		status: 201,
		description: 'Пользователь успешно зарегистрирован',
	})
	@ApiResponse({
		status: 400,
		description: 'Ошибка валидации или пользователь уже существует',
	})
	@ApiBody({ type: CreateAuthDto })
	@UseGuards(RegistrationRateLimitGuard)
	@Post('register')
	register(@Body() createAuthDto: CreateAuthDto) {
		return this.authService.register(createAuthDto)
	}

	@ApiOperation({ summary: 'Авторизация зарегистрированного пользователя' })
	@ApiResponse({
		status: 200,
		description: 'Пользователь успешно авторизован, возвращены данные профиля',
		schema: {
			properties: {
				success: { type: 'boolean', example: true },
				message: { type: 'string', example: 'Авторизация успешна' },
				data: {
					type: 'object',
					properties: {
						telegramId: { type: 'string', example: '123456789' },
						name: { type: 'string', example: 'Иван Иванов' },
						town: { type: 'string', example: 'Москва' },
						sex: { type: 'string', example: 'Male' },
						age: { type: 'number', example: 25 },
						bio: { type: 'string', example: 'Люблю путешествовать' },
						lang: { type: 'string', example: 'ru' },
						enableGeo: { type: 'boolean', example: true },
						isVerify: { type: 'boolean', example: false },
						latitude: { type: 'number', example: 55.7558, nullable: true },
						longitude: { type: 'number', example: 37.6176, nullable: true },
						role: { type: 'string', example: 'User' },
						status: { type: 'string', example: 'Pro' },
						referralCode: {
							type: 'string',
							example: 'abc12345',
							nullable: true,
						},
						createdAt: { type: 'string', format: 'date-time' },
						updatedAt: { type: 'string', format: 'date-time' },
						photos: {
							type: 'array',
							items: { type: 'string', format: 'url' },
							example: [
								'https://s3.amazonaws.com/...',
								'https://s3.amazonaws.com/...',
							],
						},
						interest: {
							type: 'object',
							nullable: true,
							properties: {
								id: { type: 'number', example: 1 },
								value: { type: 'string', example: 'travel' },
								label: { type: 'string', example: 'Путешествия' },
								isOppos: { type: 'boolean', example: false },
							},
						},
						invitedBy: {
							type: 'object',
							nullable: true,
							properties: {
								telegramId: { type: 'string', example: '987654321' },
								name: { type: 'string', example: 'Петр Петров' },
							},
						},
						invitedUsers: {
							type: 'array',
							items: {
								type: 'object',
								properties: {
									telegramId: { type: 'string', example: '111222333' },
									name: { type: 'string', example: 'Анна Сидорова' },
								},
							},
						},
					},
				},
			},
		},
	})
	@ApiResponse({
		status: 404,
		description: 'Пользователь не найден или заблокирован',
		schema: {
			properties: {
				success: { type: 'boolean', example: false },
				message: {
					type: 'string',
					example: 'Пользователь не найден или заблокирован',
				},
				errors: { type: 'object' },
			},
		},
	})
	@ApiBody({ type: LoginDto })
	@HttpCode(200)
	@Post('login')
	login(@Body() loginDto: LoginDto): Promise<any> {
		return this.authService.login(loginDto)
	}
}
