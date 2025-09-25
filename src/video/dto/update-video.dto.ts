import { IsBoolean, IsOptional, IsString } from 'class-validator'

export class UpdateVideoDto {
	@IsString()
	@IsOptional()
	title?: string

	@IsString()
	@IsOptional()
	description?: string

	@IsBoolean()
	@IsOptional()
	isPublished?: boolean
}
