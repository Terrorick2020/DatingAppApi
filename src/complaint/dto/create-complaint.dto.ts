import { IsString, IsEnum, IsOptional } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { ComplaintType } from '../complaint.types'

export class CreateComplaintDto {
	@ApiProperty({
		description: 'ID отправителя жалобы',
		example: '123456789',
	})
	@IsString()
	fromUserId!: string

	@ApiProperty({
		description: 'ID пользователя, на которого жалуются',
		example: '987654321',
	})
	@IsString()
	reportedUserId!: string

	@ApiProperty({
		description: 'Тип жалобы',
		enum: ComplaintType,
		example: ComplaintType.AGE_DRUGOE_AGE,
	})
	@IsEnum(ComplaintType)
	type!: ComplaintType

	@ApiProperty({
		description: 'Описание жалобы',
		example: 'Этот пользователь отправил мне оскорбительные сообщения',
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
