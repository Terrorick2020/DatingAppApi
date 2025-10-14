import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsEnum, IsOptional, IsString } from 'class-validator'
import { ComplaintType } from '../complaint.types'

export class CreateComplaintDto {
	@ApiProperty({
		description: 'ID отправителя жалобы',
		example: '123456789',
	})
	@IsString()
	fromUserId!: string

	@ApiPropertyOptional({
		description:
			'ID пользователя, на которого жалуются (необязательно для support)',
		example: '987654321',
	})
	@IsString()
	@IsOptional()
	reportedUserId?: string

	@ApiProperty({
		description: 'Тип жалобы',
		enum: ComplaintType,
		example: ComplaintType.AGE_DRUGOE_AGE,
	})
	@IsEnum(ComplaintType)
	type!: ComplaintType

	@ApiProperty({
		description: 'Описание жалобы/вопрос саппорту',
		example: 'У меня не открывается страница оплаты',
	})
	@IsString()
	description!: string

	@ApiPropertyOptional({
		description: 'ID контента, на который жалуются (сообщение, фото и т.д.)',
		example: 'msg_123456',
	})
	@IsString()
	@IsOptional()
	reportedContentId?: string
}
