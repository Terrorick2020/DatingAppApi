import { IsString, IsNotEmpty } from 'class-validator'

export class ReadMessagesDto {
	@IsString()
	@IsNotEmpty()
	chatId!: string

	@IsString()
	@IsNotEmpty()
	userId!: string

	@IsString()
	@IsNotEmpty()
	lastReadMessageId!: string
}
