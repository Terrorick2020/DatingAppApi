import {
	Controller,
	Post,
	Body,
	UseInterceptors,
	UploadedFile,
	HttpCode,
} from '@nestjs/common'
import { AuthService } from './auth.service'
import { CreateAuthDto } from './dto/create-auth.dto'
import { UploadPhotoDto } from './dto/upload-photo.dto'
import { FileInterceptor } from '@nestjs/platform-express'
import { StorageService } from '../storage/storage.service'
import { multerOptions } from '../config/multer.config'

@Controller('auth')
export class AuthController {
	constructor(
		private readonly authService: AuthService,
		private readonly storageService: StorageService
	) {}

	@HttpCode(200)
	@Post()
	check(@Body() createAuthDto: any): Promise<any> {
		return this.authService.check(createAuthDto)
	}

	@Post('upload-photo')
	@UseInterceptors(FileInterceptor('photo', multerOptions))
	async uploadPhoto(
		@UploadedFile() file: Express.Multer.File,
		@Body() dto: UploadPhotoDto
	) {
		const key = await this.storageService.uploadPhoto(file)
		return this.authService.uploadPhoto({ ...dto, key })
	}

	@Post('register')
	register(@Body() createAuthDto: CreateAuthDto) {
		return this.authService.register(createAuthDto)
	}
}
