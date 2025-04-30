import { IsString, IsNotEmpty } from 'class-validator'
import { ConnectionDto } from '@/common/abstract/micro/dto/connection.dto'

export class CreateDto extends ConnectionDto {
	@IsString()
	@IsNotEmpty()
	chatId!: string

	@IsString()
	@IsNotEmpty()
	toUser!: string

	@IsString()
	@IsNotEmpty()
	msg!: string
}
