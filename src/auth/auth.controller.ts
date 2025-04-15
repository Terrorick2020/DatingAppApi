import {
	Body,
	Controller,
	HttpCode,
	Post,
	UploadedFile,
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

@Controller('auth')
export class AuthController {
	constructor(
		private readonly authService: AuthService,
		private readonly storageService: StorageService
	) {}

	@HttpCode(200)
	@Post('check')
	check(@Body() checkAuthDto: CheckAuthDto): Promise<any> {
		return this.authService.check(checkAuthDto)
	}

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

	@Post('register')
	register(@Body() createAuthDto: CreateAuthDto) {
		return this.authService.register(createAuthDto)
	}
}
