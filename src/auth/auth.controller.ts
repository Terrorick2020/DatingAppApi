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
						// ... остальные поля
						photos: {
							type: 'array',
							items: {
								type: 'object',
								properties: {
									id: {
										type: 'number',
										example: 123,
										description: 'ID фотографии в базе данных',
									},
									url: {
										type: 'string',
										format: 'url',
										example:
											'https://s3.amazonaws.com/bucket/photo.jpg?X-Amz-...',
										description:
											'Presigned URL для доступа к фотографии (действителен 2 часа)',
									},
								},
								required: ['id', 'url'],
							},
							example: [
								{
									id: 123,
									url: 'https://s3.amazonaws.com/bucket/photo1.jpg?X-Amz-...',
								},
								{
									id: 124,
									url: 'https://s3.amazonaws.com/bucket/photo2.jpg?X-Amz-...',
								},
							],
						},
						// ... остальные поля
					},
				},
			},
		},
	})
	@ApiResponse({
		status: 404,
		description: 'Пользователь не найден или заблокирован',
	})
	@ApiBody({ type: LoginDto })
	@HttpCode(200)
	@Post('login')
	login(@Body() loginDto: LoginDto): Promise<any> {
		return this.authService.login(loginDto)
	}
}
