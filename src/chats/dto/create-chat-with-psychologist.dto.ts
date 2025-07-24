import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString } from 'class-validator'

export class CreateChatWithPsychologistDto {
	@ApiProperty({ description: 'Telegram ID пользователя' })
	@IsString()
	@IsNotEmpty()
	telegramId!: string

	@ApiProperty({ description: 'ID психолога' })
	@IsString()
	@IsNotEmpty()
	psychologistId!: string
} 