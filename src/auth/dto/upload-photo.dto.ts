import { Transform } from 'class-transformer'
import { IsNotEmpty, IsString, Matches } from 'class-validator'

export class UploadPhotoDto {
	@IsString()
	@IsNotEmpty()
	key!: string

	@IsString()
	@IsNotEmpty()
	telegramId!: string
}
