import { ApiProperty } from '@nestjs/swagger'
import { IsString, IsNotEmpty, IsEnum } from 'class-validator'

export class CreateLikeDto {
	@ApiProperty({
		description: 'Telegram ID отправителя симпатии',
		example: '123456789',
	})
	@IsString()
	@IsNotEmpty()
	fromUserId: string

	@ApiProperty({
		description: 'Telegram ID получателя симпатии',
		example: '987654321',
	})
	@IsString()
	@IsNotEmpty()
	toUserId: string
}
