import { IsNotEmpty, IsString } from 'class-validator'

export class UploadPhotoRequestDto {
	@IsString()
	@IsNotEmpty()
	telegramId!: string
}
