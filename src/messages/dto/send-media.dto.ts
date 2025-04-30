import { IsString, IsNotEmpty } from 'class-validator'

export class SendMediaDto {
	@IsString()
	@IsNotEmpty()
	chatId!: string

	@IsString()
	@IsNotEmpty()
	fromUser!: string

	@IsString()
	@IsNotEmpty()
	toUser!: string

	@IsString()
	@IsNotEmpty()
	text!: string

	@IsString()
	@IsNotEmpty()
	media_type!: string

	@IsString()
	@IsNotEmpty()
	media_url!: string
}
