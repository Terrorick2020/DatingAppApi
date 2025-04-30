import { IsString, IsNotEmpty, IsBoolean } from 'class-validator'

export class TypingStatusDto {
	@IsString()
	@IsNotEmpty()
	userId!: string

	@IsString()
	@IsNotEmpty()
	chatId!: string

	@IsBoolean()
	@IsNotEmpty()
	isTyping!: boolean
}
