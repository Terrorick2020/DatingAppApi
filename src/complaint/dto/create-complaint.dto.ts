import { IsString, IsEnum, IsOptional } from 'class-validator'

export enum ComplaintType {
	OFFENSIVE_CONTENT = 'OFFENSIVE_CONTENT',
	FAKE_PROFILE = 'FAKE_PROFILE',
	HARASSMENT = 'HARASSMENT',
	INAPPROPRIATE_PHOTO = 'INAPPROPRIATE_PHOTO',
	SPAM = 'SPAM',
	UNDERAGE_USER = 'UNDERAGE_USER',
	OTHER = 'OTHER',
}

export class CreateComplaintDto {
	@IsString()
	roomName: string

	@IsString()
	telegramId: string

	@IsString()
	fromUserId: string

	@IsString()
	reportedUserId: string

	@IsEnum(ComplaintType)
	type: ComplaintType

	@IsString()
	description: string

	@IsString()
	@IsOptional()
	reportedContentId?: string
}
