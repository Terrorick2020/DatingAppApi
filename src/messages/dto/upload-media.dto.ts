import { IsString, IsNotEmpty } from 'class-validator'

export class UploadMediaDto {
	@IsString()
	@IsNotEmpty()
	chatId!: string

	@IsString()
	@IsNotEmpty()
	fromUser!: string
}
